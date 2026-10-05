import { InsufficientCredit } from "../errors.js";
import { computeBalance, usageWindow } from "../usage.js";
import { ensureSubscription, logBillingEvent } from "./store.js";
export async function getBalance(rt, service, orgId, meter, now = new Date()) {
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
    if (grants.error)
        throw new Error(`Credit grants unreadable: ${grants.error.message}`);
    if (total.error)
        throw new Error(`Usage total unreadable: ${total.error.message}`);
    return computeBalance({
        meter,
        allowance,
        period,
        grants: (grants.data ?? []).map((g) => ({
            amount: Number(g.amount ?? 0),
            expiresAt: g.expires_at ?? null,
        })),
        spent: Number(total.data ?? 0),
        now,
    });
}
/** Throw `InsufficientCredit` when `price` exceeds what's left. Call it BEFORE
 *  the work that costs money, and `recordUsage` after the work succeeds. */
export async function assertCanAfford(rt, service, orgId, meter, price, describe = (b) => `Not enough ${meter} left: this costs ${price}, ${b.remaining} remains.`) {
    const balance = await getBalance(rt, service, orgId, meter);
    if (price > balance.remaining) {
        throw new InsufficientCredit(meter, balance.remaining, price, describe(balance));
    }
    return balance;
}
export async function recordUsage(service, input) {
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
    if (error)
        throw new Error(`Usage charge failed: ${error.message}`);
}
/** Add credit on top of the plan's allowance — a trial extension, an apology,
 *  a bought bundle. Logged to the audit trail. */
export async function grantCredit(service, input) {
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
    if (error)
        throw new Error(`Credit grant failed: ${error.message}`);
    await logBillingEvent(service, input.orgId, "credit.granted", input.grantedBy, {
        meter: input.meter,
        amount: input.amount,
        reason: input.reason,
        expires_at: input.expiresAt ?? null,
    });
}
