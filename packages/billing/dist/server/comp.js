import { ensureSubscription, logBillingEvent, saveSubscription } from "./store.js";
export async function setPlanByAdmin(rt, service, input) {
    const before = await ensureSubscription(rt, service, input.orgId);
    // A live Stripe subscription is Stripe's to change: its next webhook would
    // mirror Stripe's tier straight back over a hand edit, and the customer
    // would keep being charged for whatever Stripe thinks they have.
    if (before.provider === "stripe" && before.providerSubscriptionId && before.status !== "canceled") {
        throw new Error("This workspace pays through Stripe — change its plan in Stripe, not here.");
    }
    const changed = before.plan !== input.plan;
    if (changed) {
        // A comp is free by definition. Re-saving an unchanged tier writes nothing,
        // so a paying mock subscription's frozen price is never zeroed by a refresh.
        await saveSubscription(rt, service, input.orgId, {
            plan: input.plan,
            status: "active",
            unitAmountCents: 0,
            cancelAtPeriodEnd: false,
            canceledAt: null,
        });
        await logBillingEvent(service, input.orgId, "plan.comped", input.actorEmail, {
            from: before.plan,
            to: input.plan,
            unit_amount_cents: 0,
        });
    }
    return { from: before.plan, to: input.plan, changed };
}
