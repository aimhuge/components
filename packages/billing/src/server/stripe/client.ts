/**
 * The Stripe SDK client and its configuration, per app.
 *
 * Price ids live in the environment, not the catalog: they're minted per
 * Stripe account and per mode (test and live have different ids for the same
 * product). The catalog stays the source of truth for what a plan COSTS;
 * Stripe stays the source of truth for which object represents that cost.
 * Nothing reconciles the two — a price in Stripe that disagrees with the
 * catalog is a real bug, so create them to match.
 *
 * Environment, all server-only:
 *   STRIPE_SECRET_KEY               sk_test_… / sk_live_… (or a restricted rk_…)
 *   STRIPE_WEBHOOK_SECRET           whsec_… for THIS app's endpoint
 *   STRIPE_PRICE_<PLAN>_<INTERVAL>  one per paid plan × monthly/yearly,
 *                                   e.g. STRIPE_PRICE_PRO_MONTHLY
 *   STRIPE_PRICE_<PLAN>_<INTERVAL>_<VARIANT>
 *                                   optional, one per `priceVariants` entry,
 *                                   e.g. STRIPE_PRICE_PRO_MONTHLY_REGIONAL_LOW
 */
import Stripe from "stripe";
import { BILLING_INTERVALS, type BasePlan, type BillingInterval } from "../../catalog.js";
import type { Runtime } from "../runtime.js";
import type { PriceLookup } from "./map.js";

/**
 * Pinned, not floating. Stripe changes response shapes between versions — in
 * this one the billing period moved off the subscription onto its items, which
 * silently becomes "renews Invalid Date" if assumed otherwise. An SDK upgrade
 * should be a deliberate migration with a diff to read.
 */
export const STRIPE_API_VERSION = "2026-07-29.dahlia";

export interface StripeConfig<P extends string = string> extends PriceLookup<P> {
  secretKey: string;
  webhookSecret: string;
  siteOrigin: string;
}

const envPart = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "_");

export function priceEnvName(plan: string, interval: BillingInterval, variant?: string): string {
  const base = `STRIPE_PRICE_${envPart(plan)}_${interval.toUpperCase()}`;
  return variant ? `${base}_${envPart(variant)}` : base;
}

/** Test-mode keys move no real money; the UI must say so exactly as it does
 *  for the mock. A live-looking page backed by test keys is the worst state. */
export function isTestKey(secretKey: string): boolean {
  return secretKey.startsWith("sk_test_") || secretKey.startsWith("rk_test_");
}

/**
 * Read and validate the config, collecting EVERY missing variable before
 * throwing — someone setting this up should get one list, not six errors.
 */
export function readStripeConfig<P extends string, T extends BasePlan<P>>(rt: Runtime<P, T>): StripeConfig<P> {
  const missing: string[] = [];
  const need = (name: string): string => {
    const value = (rt.env[name] ?? "").trim();
    if (!value) missing.push(name);
    return value;
  };

  const secretKey = need("STRIPE_SECRET_KEY");
  const webhookSecret = need("STRIPE_WEBHOOK_SECRET");
  const prices: Partial<Record<P, Record<BillingInterval, string>>> = {};
  for (const plan of rt.catalog.paid) {
    const byInterval = {} as Record<BillingInterval, string>;
    for (const interval of BILLING_INTERVALS) byInterval[interval] = need(priceEnvName(plan, interval));
    prices[plan] = byInterval;
  }
  // Variant prices are optional: an unset one sells the plan's own price, so
  // they never join the missing list.
  const variants: NonNullable<PriceLookup<P>["variants"]> = {};
  for (const plan of rt.catalog.paid) {
    for (const interval of BILLING_INTERVALS) {
      for (const variant of rt.priceVariants) {
        const value = (rt.env[priceEnvName(plan, interval, variant)] ?? "").trim();
        if (!value) continue;
        const byInterval = (variants[plan] ??= {});
        (byInterval[interval] ??= {})[variant] = value;
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `BILLING_PROVIDER=stripe but these environment variables are missing: ${missing.join(", ")}.`,
    );
  }
  // A publishable key in the secret slot would surface as a confusing 401 on
  // the first upgrade attempt.
  if (secretKey.startsWith("pk_")) {
    throw new Error("STRIPE_SECRET_KEY holds a publishable key (pk_…). It needs the secret key (sk_… or rk_…).");
  }
  return { secretKey, webhookSecret, prices, variants, siteOrigin: rt.siteOrigin() };
}

export interface StripeHandle<P extends string = string> {
  config(): StripeConfig<P>;
  client(): Stripe;
}

/**
 * Lazily built and memoized: the SDK keeps a pooled HTTP agent, and merely
 * creating billing for an app that runs the mock must not demand credentials.
 */
export function createStripeHandle<P extends string, T extends BasePlan<P>>(rt: Runtime<P, T>): StripeHandle<P> {
  let config: StripeConfig<P> | null = null;
  let client: Stripe | null = null;
  const readConfig = () => (config ??= readStripeConfig(rt));
  return {
    config: readConfig,
    client() {
      client ??= new Stripe(readConfig().secretKey, {
        apiVersion: STRIPE_API_VERSION,
        appInfo: { name: rt.displayName, url: rt.url },
        // Stripe dedupes retried requests, so a network blip can't double-charge.
        maxNetworkRetries: 2,
      });
      return client;
    },
  };
}
