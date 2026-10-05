/**
 * Billing writes: the subscription mirror, invoice issue, and the audit trail.
 *
 * Providers call these; app code reads through them. Two invariants are
 * checkable by reading this one file:
 *
 *  1. A tier change is a SUBSCRIPTION change. An app that mirrors the tier
 *     elsewhere (DeckCP's `orgs.plan`) does it with a database trigger on
 *     `org_subscriptions`, never with a second write from here — a failure
 *     between two requests is how a mirror drifts for weeks.
 *
 *  2. An invoice is written once, with its amounts already decided. Nothing
 *     here recomputes a total from the catalog.
 */
import type { BasePlan, BillingInterval } from "../catalog.js";
import { periodFrom, rollForward } from "../period.js";
import type { BillingProviderId, Invoice, InvoiceLine, InvoiceStatus, Subscription } from "../types.js";
import {
  INVOICE_COLUMNS,
  SUBSCRIPTION_COLUMNS,
  toInvoice,
  toSubscription,
  type InvoiceRow,
  type SubscriptionRow,
} from "./rows.js";
import type { Runtime, Service } from "./runtime.js";

/**
 * True when nothing upstream renews this subscription, so the app must: a free
 * or comped ($0) row with no live Stripe subscription behind it. Its lapsed
 * period is rolled forward on read, and the usage allowance measured against
 * it resets with it. A PAID period is never rolled here — under Stripe the
 * webhook moves it, and under the mock a free renewal would hide that the mock
 * doesn't bill renewals.
 */
export function rollsOnRead(subscription: Subscription): boolean {
  if (subscription.unitAmountCents !== 0) return false;
  const stripeOwned =
    subscription.provider === "stripe" &&
    !!subscription.providerSubscriptionId &&
    subscription.status !== "canceled";
  return !stripeOwned;
}

/**
 * Read the org's subscription, creating the default free row on first touch.
 *
 * Lazy rather than at signup: orgs predate billing, so a backfill would have
 * to be perfect forever and every new code path would have to remember. An org
 * with no row simply IS free, and the first billing read makes that explicit.
 * The insert is an upsert on the PK, so two concurrent first reads settle into
 * one row instead of one throwing.
 */
export async function ensureSubscription<P extends string, T extends BasePlan<P>>(
  rt: Runtime<P, T>,
  service: Service,
  orgId: string,
  now: Date = new Date(),
): Promise<Subscription<P>> {
  const { data: existing } = await service
    .from("org_subscriptions")
    .select(SUBSCRIPTION_COLUMNS)
    .eq("org_id", orgId)
    .maybeSingle();

  if (existing) {
    const subscription = toSubscription(rt.catalog, existing as SubscriptionRow);
    if (!rollsOnRead(subscription)) return subscription;
    const period = { start: subscription.currentPeriodStart, end: subscription.currentPeriodEnd };
    const rolled = rollForward(period, subscription.interval, now);
    if (rolled === period) return subscription;
    // Conditional on the old end, so two concurrent readers can't both roll —
    // and if they did, they'd write the same arithmetic anyway.
    await service
      .from("org_subscriptions")
      .update({ current_period_start: rolled.start, current_period_end: rolled.end, updated_at: now.toISOString() })
      .eq("org_id", orgId)
      .eq("current_period_end", subscription.currentPeriodEnd);
    return { ...subscription, currentPeriodStart: rolled.start, currentPeriodEnd: rolled.end };
  }

  const period = periodFrom(now, "monthly");
  const { data, error } = await service
    .from("org_subscriptions")
    .upsert(
      {
        org_id: orgId,
        plan: rt.catalog.free,
        status: "active",
        billing_interval: "monthly",
        seats: 1,
        unit_amount_cents: 0,
        current_period_start: period.start,
        current_period_end: period.end,
      },
      { onConflict: "org_id" },
    )
    .select(SUBSCRIPTION_COLUMNS)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not open a billing record");
  return toSubscription(rt.catalog, data as SubscriptionRow);
}

export interface SubscriptionPatch<P extends string> {
  plan?: P;
  status?: Subscription["status"];
  interval?: BillingInterval;
  seats?: number;
  unitAmountCents?: number;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: string | null;
  trialEnd?: string | null;
  provider?: BillingProviderId;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
}

/**
 * Apply a patch to the org's subscription. A canceled subscription still
 * reports its paid tier until the period actually ends — downgrading at cancel
 * time would revoke features the customer already paid through.
 */
export async function saveSubscription<P extends string, T extends BasePlan<P>>(
  rt: Runtime<P, T>,
  service: Service,
  orgId: string,
  patch: SubscriptionPatch<P>,
): Promise<Subscription<P>> {
  // Read the tier first: onPlanChange must fire only on an actual CHANGE, and
  // after the update there's nothing left to compare to.
  const before = await ensureSubscription(rt, service, orgId);

  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.plan !== undefined) row.plan = patch.plan;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.interval !== undefined) row.billing_interval = patch.interval;
  if (patch.seats !== undefined) row.seats = Math.max(1, Math.trunc(patch.seats));
  if (patch.unitAmountCents !== undefined) row.unit_amount_cents = Math.max(0, Math.round(patch.unitAmountCents));
  if (patch.currentPeriodStart !== undefined) row.current_period_start = patch.currentPeriodStart;
  if (patch.currentPeriodEnd !== undefined) row.current_period_end = patch.currentPeriodEnd;
  if (patch.cancelAtPeriodEnd !== undefined) row.cancel_at_period_end = patch.cancelAtPeriodEnd;
  if (patch.canceledAt !== undefined) row.canceled_at = patch.canceledAt;
  if (patch.trialEnd !== undefined) row.trial_end = patch.trialEnd;
  if (patch.provider !== undefined) row.provider = patch.provider;
  if (patch.providerCustomerId !== undefined) row.provider_customer_id = patch.providerCustomerId;
  if (patch.providerSubscriptionId !== undefined) row.provider_subscription_id = patch.providerSubscriptionId;

  const { data, error } = await service
    .from("org_subscriptions")
    .update(row)
    .eq("org_id", orgId)
    .select(SUBSCRIPTION_COLUMNS)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not save the subscription");

  const subscription = toSubscription(rt.catalog, data as SubscriptionRow);
  await rt.notifyPlanChange({ service, orgId, from: before.plan, to: subscription.plan });
  return subscription;
}

/** Append to the audit trail. Never throws — losing a log line must not fail
 *  a payment the provider has already taken. */
export async function logBillingEvent(
  service: Service,
  orgId: string,
  kind: string,
  actorEmail: string | null,
  payload: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await service
    .from("org_billing_events")
    .insert({ org_id: orgId, kind, actor_email: actorEmail, payload });
  if (error) console.error("[billing] audit write failed", kind, error.message);
}

export interface IssueInvoiceInput {
  lines: InvoiceLine[];
  status: InvoiceStatus;
  description: string;
  periodStart?: string;
  periodEnd?: string;
  currency?: string;
  provider?: BillingProviderId;
  providerInvoiceId?: string | null;
  /** Charged instantly — stamps paid_at and amount_paid. */
  paid?: boolean;
}

/**
 * Write an invoice. Totals come from the lines, once. A credit note (a
 * downgrade whose credit exceeds the new charge) issues `paid` with a negative
 * total — the money is owed TO the customer, so `open` would show a bill.
 */
export async function issueInvoice(
  rt: Runtime,
  service: Service,
  orgId: string,
  input: IssueInvoiceInput,
): Promise<Invoice> {
  const subtotal = input.lines.reduce((total, line) => total + line.amountCents, 0);
  const now = new Date().toISOString();
  const number = await nextInvoiceNumber(rt, service);

  const { data, error } = await service
    .from("org_invoices")
    .insert({
      org_id: orgId,
      number,
      status: input.status,
      currency: input.currency ?? "usd",
      subtotal_cents: subtotal,
      // No tax engine. Explicitly zero rather than absent: an invoice with a
      // missing tax line and one with a zero tax line are different documents.
      tax_cents: 0,
      total_cents: subtotal,
      amount_paid_cents: input.paid ? subtotal : 0,
      period_start: input.periodStart ?? null,
      period_end: input.periodEnd ?? null,
      issued_at: now,
      paid_at: input.paid ? now : null,
      due_at: input.status === "open" ? now : null,
      description: input.description,
      lines: input.lines,
      provider: input.provider ?? "mock",
      provider_invoice_id: input.providerInvoiceId ?? null,
    })
    .select(INVOICE_COLUMNS)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not issue the invoice");
  return toInvoice(data as InvoiceRow);
}

/**
 * Next human invoice number, "DCP-2026-0001": the year's highest plus one.
 * Not a sequence, because it must be year-scoped and gapless-looking without a
 * yearly reset job. The unique index on `number` is what prevents a collision —
 * two requests in the same millisecond fail loudly rather than duplicate.
 */
async function nextInvoiceNumber(rt: Runtime, service: Service): Promise<string> {
  const prefix = `${rt.invoicePrefix}-${new Date().getUTCFullYear()}-`;
  const { data } = await service
    .from("org_invoices")
    .select("number")
    .like("number", `${prefix}%`)
    .order("number", { ascending: false })
    .limit(1);
  const last = (data ?? [])[0]?.number as string | undefined;
  const lastSeq = last ? Number.parseInt(last.slice(prefix.length), 10) : 0;
  return `${prefix}${String(Number.isFinite(lastSeq) ? lastSeq + 1 : 1).padStart(4, "0")}`;
}

/** Re-read the mirror, so callers get the persisted truth after a sync. */
export async function loadSubscription<P extends string, T extends BasePlan<P>>(
  rt: Runtime<P, T>,
  service: Service,
  orgId: string,
): Promise<Subscription<P>> {
  const { data, error } = await service
    .from("org_subscriptions")
    .select(SUBSCRIPTION_COLUMNS)
    .eq("org_id", orgId)
    .single();
  if (error || !data) throw new Error(error?.message ?? "No billing record for this workspace");
  return toSubscription(rt.catalog, data as SubscriptionRow);
}
