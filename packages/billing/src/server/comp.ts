/**
 * An operator setting an org's tier by hand — a comp, a repair, a downgrade.
 *
 * The one sanctioned way to move a tier without a checkout: it goes through
 * `saveSubscription`, so the app's `onPlanChange` and any database mirror
 * follow exactly as they would for a purchase. Apps wrap it with their own
 * super-admin gate and anything they must ALWAYS refresh (DeckCP re-clears
 * its deck caches even when the tier didn't change).
 */
import type { BasePlan } from "../catalog.js";
import type { Runtime, Service } from "./runtime.js";
import { ensureSubscription, logBillingEvent, saveSubscription } from "./store.js";

export interface SetPlanResult<P extends string> {
  from: P;
  to: P;
  changed: boolean;
}

export async function setPlanByAdmin<P extends string, T extends BasePlan<P>>(
  rt: Runtime<P, T>,
  service: Service,
  input: { orgId: string; plan: P; actorEmail: string | null },
): Promise<SetPlanResult<P>> {
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
