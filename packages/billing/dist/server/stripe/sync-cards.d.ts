/**
 * Mirroring a Stripe customer's cards into `org_payment_methods`.
 *
 * A full replace against Stripe's list rather than incremental patching: cards
 * can be removed in the portal without an event we handle, so reconciling
 * against the authoritative list is the only way the mirror can't drift.
 * Cheap — nobody has many cards.
 */
import type Stripe from "stripe";
import type { Service } from "../runtime.js";
export declare function syncPaymentMethods(service: Service, orgId: string, methods: Stripe.PaymentMethod[], defaultPaymentMethodId: string | null): Promise<void>;
/** Pull a customer's cards from Stripe and mirror them. */
export declare function refreshPaymentMethods(service: Service, stripe: Stripe, orgId: string, customerId: string): Promise<void>;
