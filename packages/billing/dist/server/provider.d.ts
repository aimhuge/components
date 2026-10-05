/**
 * The payment-provider seam.
 *
 * Billing pages, server actions and the read layer talk only to
 * `BillingProvider`. Nothing above it imports a vendor SDK, knows what a
 * Stripe price id looks like, or cares whether checkout redirects offsite.
 *
 * Two rules every implementation keeps:
 *
 *  1. A provider owns UPSTREAM state and mirrors the result into our tables
 *     before it returns. Callers re-read; they never patch rows. That's what
 *     lets a webhook-driven provider and an inline one leave the database in
 *     the same shape.
 *
 *  2. A card number never crosses this boundary. `attachPaymentMethod` takes
 *     a token minted in the browser (the mock's test-card token, Stripe's
 *     `pm_…`), never a PAN.
 */
import type { BillingInterval } from "../catalog.js";
import type { BillingProviderId, PaymentMethod, Subscription } from "../types.js";
import type { Service } from "./runtime.js";
/** Who is asking, and on whose behalf. */
export interface BillingContext {
    service: Service;
    orgId: string;
    orgSlug: string;
    /** For the audit trail. Null for provider-initiated work (renewals, dunning). */
    actorEmail: string | null;
}
export interface ChangePlanInput<P extends string> {
    plan: P;
    interval: BillingInterval;
    seats: number;
}
export interface CheckoutInput<P extends string> extends ChangePlanInput<P> {
    /** Where to land after a hosted checkout completes or is abandoned. */
    returnPath: string;
}
/** Send the customer somewhere to pay, or report the change settled inline (a
 *  downgrade needs no new authorization, so it just applies). */
export type CheckoutResult<P extends string> = {
    kind: "redirect";
    url: string;
} | {
    kind: "applied";
    subscription: Subscription<P>;
};
export interface AttachPaymentMethodInput {
    /** Opaque provider token. NEVER a card number. */
    token: string;
    makeDefault: boolean;
}
export interface BillingProvider<P extends string = string> {
    readonly id: BillingProviderId;
    /** Shown wherever the provider must be named honestly. */
    readonly label: string;
    /** True when `startCheckout` may redirect — decides whether "Upgrade" is a
     *  navigation or a mutation before anything is called. */
    readonly hostedCheckout: boolean;
    /** False when no real money moves (the mock, Stripe test keys); the UI must
     *  say so wherever a customer could think they've paid. */
    readonly live: boolean;
    /** True when cards live in the provider's own hosted UI (Stripe's portal),
     *  so ours must not render a card form against it. */
    readonly managesPaymentMethodsExternally: boolean;
    startCheckout(ctx: BillingContext, input: CheckoutInput<P>): Promise<CheckoutResult<P>>;
    changePlan(ctx: BillingContext, input: ChangePlanInput<P>): Promise<Subscription<P>>;
    /** Schedule cancellation at period end. Access continues until then. */
    cancelSubscription(ctx: BillingContext): Promise<Subscription<P>>;
    /** Undo a scheduled cancellation before the period ends. */
    resumeSubscription(ctx: BillingContext): Promise<Subscription<P>>;
    attachPaymentMethod(ctx: BillingContext, input: AttachPaymentMethodInput): Promise<PaymentMethod>;
    detachPaymentMethod(ctx: BillingContext, paymentMethodId: string): Promise<void>;
    setDefaultPaymentMethod(ctx: BillingContext, paymentMethodId: string): Promise<void>;
    /** A URL to the provider's own billing UI, or null when it has none. Minted
     *  per click and never cached: portal sessions are short-lived and scoped to
     *  one customer, so a stored URL is dead or someone else's. */
    billingPortalUrl(ctx: BillingContext, returnPath: string): Promise<string | null>;
    /** Re-read upstream state and mirror it — after a checkout redirect, before
     *  the webhook lands, or as a repair. A no-op for providers with no upstream. */
    reconcile(ctx: BillingContext): Promise<void>;
}
