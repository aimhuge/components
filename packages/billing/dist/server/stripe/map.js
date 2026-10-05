import { BILLING_INTERVALS } from "../../catalog.js";
/** Seconds since epoch → ISO. Stripe speaks seconds; Postgres wants a timestamp. */
export function fromUnix(seconds) {
    if (seconds == null || !Number.isFinite(seconds))
        return null;
    return new Date(seconds * 1000).toISOString();
}
/**
 * Stripe's subscription status → ours.
 *
 * Stripe has more states than we model, and the collapsing is opinionated:
 *
 *  - `unpaid` folds into `past_due`. Both mean "we haven't been paid and haven't
 *    given up"; splitting them would give the UI two states with identical copy.
 *  - `incomplete_expired` becomes `canceled`, not `incomplete` — that checkout is
 *    dead and will never complete, so offering to resume it would be a lie.
 *  - `paused` becomes `past_due`: billing is stopped but the subscription still
 *    exists, and treating it as active would grant paid features for free.
 */
export function toSubscriptionStatus(status) {
    switch (status) {
        case "active":
            return "active";
        case "trialing":
            return "trialing";
        case "past_due":
        case "unpaid":
        case "paused":
            return "past_due";
        case "canceled":
        case "incomplete_expired":
            return "canceled";
        case "incomplete":
            return "incomplete";
        default:
            // A status Stripe adds later reads as incomplete rather than active: the
            // under-granting direction, same rule as an unknown plan reading as free.
            return "incomplete";
    }
}
/** (plan, interval) → Stripe price id, or null for a plan Stripe doesn't sell. */
export function priceIdFor(config, plan, interval) {
    return config.prices[plan]?.[interval] || null;
}
/**
 * Stripe price id → (plan, interval).
 *
 * The reverse direction matters more than it looks: a webhook tells us a
 * subscription now carries price `price_123`, and mapping that back is the ONLY
 * way to know which plan a customer moved to when they changed it in Stripe's
 * portal rather than in our UI.
 */
export function planForPriceId(config, priceId) {
    if (!priceId)
        return null;
    for (const plan of Object.keys(config.prices)) {
        for (const interval of BILLING_INTERVALS) {
            if (config.prices[plan]?.[interval] === priceId)
                return { plan, interval };
        }
    }
    return null;
}
/**
 * Read everything we store from a Stripe subscription.
 *
 * Two traps handled here, both silent if you get them wrong:
 *
 *  1. **The period moved.** In API 2025-03-31 and later, `current_period_start`
 *     and `current_period_end` are on the subscription ITEM, not the
 *     subscription. Reading them off the subscription yields `undefined`, which
 *     becomes `Invalid Date`, which becomes a renewal date the customer can't
 *     make sense of. We read the item, falling back to the subscription's own
 *     fields only for accounts still on an older API version.
 *
 *  2. **The price is the plan.** Seats are the item's `quantity` and the
 *     per-seat figure is the price's `unit_amount` — NOT the invoice total.
 *     Confusing the two is how a five-seat workspace gets billed for one.
 *
 * Returns null when the subscription carries a price we don't recognise, which
 * means someone attached a price in the Stripe dashboard that isn't in our
 * catalog. Guessing a plan there would grant features nobody paid for.
 */
export function readSubscription(config, subscription) {
    const item = subscription.items?.data?.[0];
    if (!item)
        return null;
    const price = item.price;
    const mapped = planForPriceId(config, price?.id);
    if (!mapped)
        return null;
    // The legacy cast reaches subscription-level period fields that older API
    // versions used, so a pinned SDK and an older account both yield a real date.
    const legacy = subscription;
    const periodStart = fromUnix(item.current_period_start ?? legacy.current_period_start);
    const periodEnd = fromUnix(item.current_period_end ?? legacy.current_period_end);
    if (!periodStart || !periodEnd)
        return null;
    return {
        plan: mapped.plan,
        interval: mapped.interval,
        seats: Math.max(1, item.quantity ?? 1),
        unitAmountCents: price?.unit_amount ?? 0,
        currency: (price?.currency ?? subscription.currency ?? "usd").toLowerCase(),
        status: toSubscriptionStatus(subscription.status),
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: !!subscription.cancel_at_period_end,
        canceledAt: fromUnix(subscription.canceled_at),
        trialEnd: fromUnix(subscription.trial_end),
        providerSubscriptionId: subscription.id,
        providerCustomerId: typeof subscription.customer === "string"
            ? subscription.customer
            : (subscription.customer?.id ?? null),
    };
}
/**
 * The app a Stripe object was created by, from `metadata.app` — on the object
 * itself, or for an invoice on the subscription it bills (`parent` in newer API
 * versions, `subscription_details` in older). Null when nothing says.
 *
 * This is what lets several apps share one Stripe account: every customer,
 * checkout session and subscription is stamped at creation, and a webhook
 * that sees another app's stamp acknowledges and drops the event.
 */
export function stripeObjectApp(object) {
    if (!object || typeof object !== "object")
        return null;
    const loose = object;
    return (loose.metadata?.app ||
        loose.parent?.subscription_details?.metadata?.app ||
        loose.subscription_details?.metadata?.app ||
        null);
}
/** Stripe expands some references and leaves others as bare ids. */
export function asId(value) {
    if (typeof value === "string")
        return value;
    if (value && typeof value === "object" && "id" in value) {
        const id = value.id;
        return typeof id === "string" ? id : null;
    }
    return null;
}
/** The subscription an invoice belongs to — under `parent` in newer API
 *  versions; read both so a version bump doesn't stop clearing past_due. */
export function invoiceSubscriptionId(invoice) {
    const loose = invoice;
    return asId(loose.subscription) ?? asId(loose.parent?.subscription_details?.subscription);
}
