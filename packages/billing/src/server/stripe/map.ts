/**
 * Stripe objects → our domain types. Pure functions, no SDK calls, no DB.
 *
 * All the fiddly, version-sensitive, easy-to-get-silently-wrong translation
 * lives here precisely BECAUSE it's the part that can be tested without a
 * Stripe account: seconds→ISO, a status vocabulary that's close to ours but not
 * identical, and a billing period that moved onto subscription items in this
 * API version.
 *
 * The adapter and the webhook both go through these, so a subscription synced
 * by an API call and the same subscription synced by a webhook can't disagree.
 * Invoices are in ./map-invoice.
 */
import type Stripe from "stripe";
import { BILLING_INTERVALS, type BillingInterval } from "../../catalog.js";
import type { SubscriptionStatus } from "../../types.js";

/** Seconds since epoch → ISO. Stripe speaks seconds; Postgres wants a timestamp. */
export function fromUnix(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds)) return null;
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
export function toSubscriptionStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
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

/** Just the price table out of the Stripe config, so these stay unit-testable.
 *  Paid plans only — a free plan is never sold, so it has no price. */
export interface PriceLookup<P extends string = string> {
  prices: Partial<Record<P, Record<BillingInterval, string>>>;
}

/** (plan, interval) → Stripe price id, or null for a plan Stripe doesn't sell. */
export function priceIdFor<P extends string>(
  config: PriceLookup<P>,
  plan: P,
  interval: BillingInterval,
): string | null {
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
export function planForPriceId<P extends string>(
  config: PriceLookup<P>,
  priceId: string | null | undefined,
): { plan: P; interval: BillingInterval } | null {
  if (!priceId) return null;
  for (const plan of Object.keys(config.prices) as P[]) {
    for (const interval of BILLING_INTERVALS) {
      if (config.prices[plan]?.[interval] === priceId) return { plan, interval };
    }
  }
  return null;
}

export interface SubscriptionFacts<P extends string = string> {
  plan: P;
  interval: BillingInterval;
  seats: number;
  unitAmountCents: number;
  currency: string;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  trialEnd: string | null;
  providerSubscriptionId: string;
  providerCustomerId: string | null;
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
export function readSubscription<P extends string>(
  config: PriceLookup<P>,
  subscription: Stripe.Subscription,
): SubscriptionFacts<P> | null {
  const item = subscription.items?.data?.[0];
  if (!item) return null;

  const price = item.price;
  const mapped = planForPriceId(config, price?.id);
  if (!mapped) return null;

  // The legacy cast reaches subscription-level period fields that older API
  // versions used, so a pinned SDK and an older account both yield a real date.
  const legacy = subscription as unknown as {
    current_period_start?: number;
    current_period_end?: number;
  };
  const periodStart = fromUnix(item.current_period_start ?? legacy.current_period_start);
  const periodEnd = fromUnix(item.current_period_end ?? legacy.current_period_end);
  if (!periodStart || !periodEnd) return null;

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
    providerCustomerId:
      typeof subscription.customer === "string"
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
export function stripeObjectApp(object: unknown): string | null {
  if (!object || typeof object !== "object") return null;
  const loose = object as {
    metadata?: Record<string, string> | null;
    subscription_details?: { metadata?: Record<string, string> | null } | null;
    parent?: { subscription_details?: { metadata?: Record<string, string> | null } | null } | null;
  };
  return (
    loose.metadata?.app ||
    loose.parent?.subscription_details?.metadata?.app ||
    loose.subscription_details?.metadata?.app ||
    null
  );
}

/** Stripe expands some references and leaves others as bare ids. */
export function asId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

/** The subscription an invoice belongs to — under `parent` in newer API
 *  versions; read both so a version bump doesn't stop clearing past_due. */
export function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const loose = invoice as unknown as {
    subscription?: unknown;
    parent?: { subscription_details?: { subscription?: unknown } | null } | null;
  };
  return asId(loose.subscription) ?? asId(loose.parent?.subscription_details?.subscription);
}
