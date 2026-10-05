import type { BillingContext } from "../provider.js";
import type { StripeEnv } from "./sync.js";
/** Every Stripe object we create carries these. `app` lets several apps share
 *  one Stripe account; `org_id` lets a webhook resolve an org before we've
 *  stored the customer id. */
export declare function stamp(env: StripeEnv, ctx: BillingContext): Record<string, string>;
/**
 * The org's Stripe customer, created on first need and persisted immediately —
 * an abandoned checkout must not mint a second customer next time. A customer
 * deleted in the dashboard is replaced rather than failing every call after.
 */
export declare function ensureCustomer(env: StripeEnv, ctx: BillingContext): Promise<string>;
/**
 * Our payment-method row id → Stripe's `pm_…`. Looking it up through the
 * org-scoped mirror IS the authorization check: another org's row id simply
 * isn't found, so a forged id can't detach someone else's card.
 */
export declare function stripePaymentMethodId(ctx: BillingContext, rowId: string): Promise<string>;
/**
 * Stripe error → something a customer can read. Card errors are written for
 * end users and pass through verbatim. Everything else (auth, rate limits, our
 * own bad requests) is ours to fix: generic message out, detail to the log.
 */
export declare function toBillingError(error: unknown): Error;
/** Run a Stripe call, translating its failure for the customer. */
export declare function guarded<R>(call: () => Promise<R>): Promise<R>;
