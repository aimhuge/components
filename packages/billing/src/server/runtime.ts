/**
 * The per-app configuration every server module reads, resolved once by
 * `createBilling`. Nothing in the server half reaches for `process.env` or an
 * app module directly — it all comes through here, which is what lets two
 * apps (and two Stripe price tables) share one implementation.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BasePlan, Catalog } from "../catalog.js";
import type { BillingProviderId, SubscriptionStatus } from "../types.js";
import { assertCheckoutBranding, type CheckoutBranding } from "./branding.js";

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

const APP_SLUG = /^[a-z0-9][a-z0-9-]{0,30}$/;
const PREFIX = /^[A-Z]{2,5}$/;

export function createRuntime<P extends string, T extends BasePlan<P>>(
  config: BillingConfig<P, T>,
): Runtime<P, T> {
  if (!APP_SLUG.test(config.app)) {
    throw new Error(`billing: app "${config.app}" must be a lowercase slug (it is stamped on Stripe objects)`);
  }
  if (!PREFIX.test(config.invoicePrefix)) {
    throw new Error(`billing: invoicePrefix "${config.invoicePrefix}" must be 2–5 capital letters`);
  }
  if (config.checkoutBranding) assertCheckoutBranding(config.checkoutBranding);
  const env = config.env ?? process.env;
  const configured = (config.provider ?? env.BILLING_PROVIDER ?? "mock").toLowerCase();

  return {
    app: config.app,
    displayName: config.displayName,
    url: config.url,
    catalog: config.catalog,
    invoicePrefix: config.invoicePrefix,
    meteredStatuses: config.meteredStatuses ?? ["active", "trialing", "past_due"],
    env,
    // Anything other than "stripe" runs the mock. "No provider configured" is
    // every developer's machine and CI, and the mock says loudly that it moves
    // no money. Selecting Stripe with missing config throws at first use.
    providerId: configured === "stripe" ? "stripe" : "mock",
    checkoutBranding: config.checkoutBranding,
    mockCheckoutPath: config.mockCheckoutPath ?? ((slug) => `/${slug}/billing/checkout`),
    siteOrigin: () =>
      (config.siteOrigin ?? env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
    async notifyPlanChange(event) {
      if (!config.onPlanChange || event.from === event.to) return;
      try {
        await config.onPlanChange(event);
      } catch (error) {
        console.warn(`[billing:${config.app}] onPlanChange failed`, error);
      }
    },
  };
}
