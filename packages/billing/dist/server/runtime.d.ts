/**
 * The per-app configuration every server module reads, resolved once by
 * `createBilling`. Nothing in the server half reaches for `process.env` or an
 * app module directly — it all comes through here, which is what lets two
 * apps (and two Stripe price tables) share one implementation.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BasePlan, Catalog } from "../catalog.js";
import type { BillingProviderId, SubscriptionStatus } from "../types.js";
import { type CheckoutBranding } from "./branding.js";
/** The service-role client. Every billing table is RLS-locked with no
 *  policies; only this client reaches them, after the app's own gate. */
export type Service = SupabaseClient;
export interface PlanChangeEvent<P extends string> {
    service: Service;
    orgId: string;
    from: P;
    to: P;
}
export interface BillingConfig<P extends string, T extends BasePlan<P>> {
    /**
     * Lowercase app slug — "deckcp", "blastcp". Stamped on every Stripe object
     * as `metadata.app`, so several apps can share ONE Stripe account: each
     * app's webhook acknowledges and drops the others' events instead of
     * failing on prices it has never heard of.
     */
    app: string;
    /** "DeckCP" — Stripe's request logs and the customer description. */
    displayName: string;
    /** "https://deckcp.com" — shown in Stripe's request logs. */
    url?: string;
    catalog: Catalog<P, T>;
    /** Human invoice numbers: "DCP" → DCP-2026-0001. */
    invoicePrefix: string;
    /** Where the mock's hosted checkout page lives. Default `/{org}/billing/checkout`. */
    mockCheckoutPath?: (orgSlug: string) => string;
    /**
     * Called after a subscription's tier actually changes (DeckCP busts its
     * deck caches here). Best-effort: a failure is logged, never thrown — it
     * must not fail a write that already took someone's money.
     */
    onPlanChange?: (event: PlanChangeEvent<P>) => Promise<void> | void;
    /**
     * Statuses under which the plan's METERED allowances apply. Others fall back
     * to the free plan's. Default: active, trialing, past_due — access isn't
     * pulled while Stripe's dunning runs. BlastCP passes active + trialing,
     * because its allowance is image generation that costs real money.
     */
    meteredStatuses?: readonly SubscriptionStatus[];
    /** Provider override. Default: `BILLING_PROVIDER` env, else the mock. */
    provider?: BillingProviderId;
    /** Origin for Stripe return URLs. Default: `NEXT_PUBLIC_SITE_URL`. */
    siteOrigin?: string;
    /** This app's look on Stripe Checkout (`./branding.ts`). Default: the account's dashboard branding. */
    checkoutBranding?: CheckoutBranding;
    /** Environment source. Default `process.env`. Tests pass their own. */
    env?: Record<string, string | undefined>;
}
export interface Runtime<P extends string = string, T extends BasePlan<P> = BasePlan<P>> {
    readonly app: string;
    readonly displayName: string;
    readonly url: string | undefined;
    readonly catalog: Catalog<P, T>;
    readonly invoicePrefix: string;
    readonly meteredStatuses: readonly SubscriptionStatus[];
    readonly env: Record<string, string | undefined>;
    readonly providerId: BillingProviderId;
    readonly checkoutBranding: CheckoutBranding | undefined;
    mockCheckoutPath(orgSlug: string): string;
    siteOrigin(): string;
    notifyPlanChange(event: PlanChangeEvent<P>): Promise<void>;
}
export declare function createRuntime<P extends string, T extends BasePlan<P>>(config: BillingConfig<P, T>): Runtime<P, T>;
