/**
 * Billing errors that are safe to show a customer.
 *
 * The distinction this class draws is the one that matters at the UI
 * boundary: a `BillingError` is something the person can act on ("your card
 * was declined", "add a payment method first") and is rendered verbatim.
 * Anything else is ours, gets logged, and becomes a generic message — a raw
 * Stripe or Postgres error string in the UI is both useless and a small
 * information leak.
 */
export class BillingError extends Error {
    constructor(message) {
        super(message);
        this.name = "BillingError";
    }
}
/**
 * A metered action the org can't afford. Carries the real numbers so a route
 * can answer 402 with them and an agent tool can say not to retry (the balance
 * won't change on its own).
 */
export class InsufficientCredit extends BillingError {
    meter;
    remaining;
    price;
    constructor(meter, remaining, price, message) {
        super(message);
        this.name = "InsufficientCredit";
        this.meter = meter;
        this.remaining = remaining;
        this.price = price;
    }
}
/** True for errors whose message may be shown to the customer as-is. */
export function isCustomerFacing(error) {
    return error instanceof BillingError;
}
