/**
 * The Stripe payment provider — same `BillingProvider` seam as the mock.
 *
 *  1. Stripe is the source of truth. Every mutation writes to Stripe, then
 *     reads the result BACK and mirrors that — never what we asked for.
 *  2. Proration is Stripe's (`create_prorations`). `previewChangeCents` is an
 *     estimate; the invoice is authoritative and the UI should say "about".
 *  3. Cards are never ours. `managesPaymentMethodsExternally` routes card
 *     management to the Customer Portal, which keeps us out of PCI scope.
 */
import type { BasePlan } from "../../catalog.js";
import type { BillingProvider } from "../provider.js";
import { type StripeEnv } from "./sync.js";
export declare function createStripeProvider<P extends string, T extends BasePlan<P>>(env: StripeEnv<P, T>): BillingProvider<P>;
