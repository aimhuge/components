/**
 * The mock payment provider — in-app test billing. It moves no money.
 *
 * What it does do is put the app through every path a real provider would:
 * hosted checkout as a redirect, tokenized cards, mid-period proration with
 * credit notes, declines, cancel-at-period-end, and an invoice trail. `live`
 * is false and the UI says so wherever a customer could think they've paid.
 * It's the default so billing works on a machine with no payment credentials.
 *
 *  - Checkout is a REDIRECT whenever the org has no card on file. A provider
 *    that settled silently would let the app grow a dependence on inline
 *    completion that Stripe then breaks.
 *  - A declining test card fails the charge and leaves the subscription
 *    `past_due` with the invoice `open` — what a real failed payment looks
 *    like, and the state the dunning UI renders.
 *  - Renewals are NOT billed: nothing advances a lapsed paid mock period.
 */
import type { BasePlan } from "../catalog.js";
import type { BillingProvider } from "./provider.js";
import type { Runtime } from "./runtime.js";
export declare function createMockProvider<P extends string, T extends BasePlan<P>>(rt: Runtime<P, T>): BillingProvider<P>;
