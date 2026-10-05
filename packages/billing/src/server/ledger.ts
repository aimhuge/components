/**
 * The usage ledger: metered charges against a plan's allowance.
 *
 * `org_usage_charges` is the source of truth for spend, one row per charge,
 * in the meter's unit (micros for a money meter). The balance is derived on
 * every read (see `computeBalance`), summed in the database by
 * `org_usage_total` — a client-side sum would silently stop at PostgREST's
 * row cap and undercount a busy org into overspending.
 *
 * KNOWN RACE, ACCEPTED. Two charges starting at the same instant can both pass
 * `assertCanAfford` and both be recorded, overdrawing by at most one charge.
 * The alternative — reserve, then refund on failure — charges people whose
 * work then failed, or leaks a reservation from a process that died mid-call.
 * Overdrawing by one charge is the better failure, and `remaining` is floored
 * at zero so no UI shows a negative.
 */
import type { BasePlan } from "../catalog.js";
import { InsufficientCredit } from "../errors.js";
import { computeBalance, usageWindow, type MeterBalance } from "../usage.js";
import type { Runtime, Service } from "./runtime.js";
import { ensureSubscription, logBillingEvent } from "./store.js";

export async function getBalance<P extends string, T extends BasePlan<P>>(
  rt: Runtime<P, T>,
  service: Service,
  orgId: string,
  meter: string,
  now: Date = new Date(),
): Promise<MeterBalance> {
  const subscription = await ensureSubscription(rt, service, orgId, now);
  // The allowance follows PAYMENT: a status outside meteredStatuses spends on
  // the free plan's allowance, though the row keeps its plan for display.
  const plan = rt.meteredStatuses.includes(subscription.status) ? subscription.plan : rt.catalog.free;
  const allowance = rt.catalog.allowance(plan, meter);
  const period = { start: subscription.currentPeriodStart, end: subscription.currentPeriodEnd };
  const window = usageWindow(allowance, period);

  const [grants, total] = await Promise.all([
    service
      .from("org_credit_grants")
      .select("amount, expires_at")
      .eq("org_id", orgId)
      .eq("meter", meter)
      .or(`expires_at.is.null,expires_at.gt.${now.toISOString()}`),
    service.rpc("org_usage_total", { p_org_id: orgId, p_meter: meter, p_since: window.start }),
  ]);
  if (grants.error) throw new Error(`Credit grants unreadable: ${grants.error.message}`);
  if (total.error) throw new Error(`Usage total unreadable: ${total.error.message}`);

  return computeBalance({
    meter,
    allowance,
    period,
    grants: (grants.data ?? []).map((g) => ({
      amount: Number(g.amount ?? 0),
      expiresAt: (g.expires_at as string | null) ?? null,
    })),
    spent: Number(total.data ?? 0),
    now,
  });
}

/** Throw `InsufficientCredit` when `price` exceeds what's left. Call it BEFORE
 *  the work that costs money, and `recordUsage` after the work succeeds. */
export async function assertCanAfford<P extends string, T extends BasePlan<P>>(
  rt: Runtime<P, T>,
  service: Service,
  orgId: string,
  meter: string,
  price: number,
  describe: (balance: MeterBalance) => string = (b) =>
    `Not enough ${meter} left: this costs ${price}, ${b.remaining} remains.`,
): Promise<MeterBalance> {
  const balance = await getBalance(rt, service, orgId, meter);
  if (price > balance.remaining) {
    throw new InsufficientCredit(meter, balance.remaining, price, describe(balance));
  }
  return balance;
}

export interface UsageInput {
  orgId: string;
  meter: string;
  /** In the meter's unit. What the ORG is charged. */
  amount: number;
  /** What it cost US, when known — stored so the margin is on every row and a
   *  later markup change can't rewrite past prices. */
  costMicros?: number | null;
  /** What the charge was for: `("media", id)`. No FK — deleting the thing must
   *  not erase the fact it was paid for, or a balance refills by deletion. */
  refType?: string | null;
  refId?: string | null;
  metadata?: Record<string, unknown>;
  createdBy?: string | null;
  createdVia?: "app" | "mcp" | "system";
}

export async function recordUsage(service: Service, input: UsageInput): Promise<void> {
  if (!Number.isInteger(input.amount) || input.amount < 0) {
    throw new Error(`Usage amount must be a non-negative integer, got ${input.amount}`);
  }
  const { error } = await service.from("org_usage_charges").insert({
    org_id: input.orgId,
    meter: input.meter,
    amount: input.amount,
    cost_micros: input.costMicros ?? null,
    ref_type: input.refType ?? null,
    ref_id: input.refId ?? null,
    metadata: input.metadata ?? {},
    created_by: input.createdBy ?? null,
    created_via: input.createdVia ?? "app",
  });
  if (error) throw new Error(`Usage charge failed: ${error.message}`);
}

export interface GrantInput {
  orgId: string;
  meter: string;
  amount: number;
  reason: string;
  /** Null = never expires: it adds to every window until removed. */
  expiresAt?: string | null;
  grantedBy: string | null;
}

/** Add credit on top of the plan's allowance — a trial extension, an apology,
 *  a bought bundle. Logged to the audit trail. */
export async function grantCredit(service: Service, input: GrantInput): Promise<void> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error(`Grant amount must be a positive integer, got ${input.amount}`);
  }
  const { error } = await service.from("org_credit_grants").insert({
    org_id: input.orgId,
    meter: input.meter,
    amount: input.amount,
    reason: input.reason,
    expires_at: input.expiresAt ?? null,
    granted_by_email: input.grantedBy,
  });
  if (error) throw new Error(`Credit grant failed: ${error.message}`);
  await logBillingEvent(service, input.orgId, "credit.granted", input.grantedBy, {
    meter: input.meter,
    amount: input.amount,
    reason: input.reason,
    expires_at: input.expiresAt ?? null,
  });
}
