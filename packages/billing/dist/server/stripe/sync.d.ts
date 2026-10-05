/**
 * Mirroring Stripe state into our tables.
 *
 * The adapter (which knows its org) and the webhook (which knows only a
 * `cus_…`) both funnel through here, so a subscription synced by an API
 * response and the same subscription synced by its webhook land identically.
 * That is what makes the webhook safe to treat as the authority: whichever
 * arrives second overwrites with the same values.
 *
 * Idempotent by construction. Stripe delivers at-least-once and out of order,
 * so everything here must be safe to run twice, in either order, without
 * inventing a row or a charge.
 */
import type Stripe from "stripe";
import type { BasePlan } from "../../catalog.js";
import type { Runtime, Service } from "../runtime.js";
import type { StripeHandle } from "./client.js";
import { type SubscriptionFacts } from "./map.js";
import { type InvoiceFacts } from "./map-invoice.js";
export interface StripeEnv<P extends string = string, T extends BasePlan<P> = BasePlan<P>> {
    rt: Runtime<P, T>;
    stripe: StripeHandle<P>;
}
/**
 * Which org owns this Stripe customer. Our own mirror first (it's OUR record
 * of the link); then metadata, which is what makes the very first
 * `checkout.session.completed` resolvable before the customer id is stored.
 *
 * Null rather than a guess: a customer made in the Stripe dashboard, or one
 * belonging to another app on a shared account, must never be applied to
 * someone's workspace.
 */
export declare function resolveOrgForCustomer(env: StripeEnv, service: Service, customerId: string | null, metadata?: {
    org_id?: string | null;
    app?: string | null;
} | null): Promise<string | null>;
/** Write a Stripe subscription's facts onto the org. A canceled subscription
 *  drops to free only once it's actually canceled — `cancel_at_period_end`
 *  keeps the plan so the customer keeps what they paid through. */
export declare function syncSubscription<P extends string>(env: StripeEnv<P>, service: Service, orgId: string, facts: SubscriptionFacts<P>, actorEmail: string | null): Promise<void>;
/**
 * Drop an org to free after its Stripe subscription ends. Opens a fresh monthly
 * period (usage is measured against it; a period that ended last Tuesday would
 * freeze every allowance). The customer id is KEPT: a returning customer
 * reuses their cards and invoice history instead of becoming a second customer.
 */
export declare function syncSubscriptionCanceled(env: StripeEnv, service: Service, orgId: string, actorEmail: string | null): Promise<void>;
/**
 * Upsert a Stripe invoice, keyed on `(provider, provider_invoice_id)` — the
 * identity that never changes; `number` is null on a draft. A redelivered
 * `invoice.paid` updates its own row. Zero invoices (a $0 trial, a change that
 * nets to nothing) are skipped as noise in a list about what was charged.
 */
export declare function syncInvoice(service: Service, orgId: string, facts: InvoiceFacts): Promise<void>;
/** Facts for a subscription, or a loud failure: a price outside the catalog
 *  means an org would sit on a plan the app can't reason about. */
export declare function requireFacts<P extends string>(env: StripeEnv<P>, subscription: Stripe.Subscription): SubscriptionFacts<P>;
/** Fetch a subscription and mirror what Stripe actually did — never our echo. */
export declare function refreshSubscription(env: StripeEnv, service: Service, orgId: string, subscriptionId: string, actorEmail: string | null): Promise<void>;
/**
 * Re-read everything Stripe knows about an org and mirror it — right after a
 * checkout redirect (the customer is back before the webhook), or as a repair.
 * Asks for the customer's LIVE subscription rather than trusting the stored id,
 * so it also recovers one created outside our flow. No live subscription drops
 * the org to free: a reconciliation, not a cancellation.
 */
export declare function reconcileFromStripe(env: StripeEnv, service: Service, orgId: string, actorEmail: string | null): Promise<void>;
