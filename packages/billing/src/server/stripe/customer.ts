/**
 * Stripe customer plumbing shared by the provider's operations.
 */
import { BillingError } from "../../errors.js";
import type { BillingContext } from "../provider.js";
import { ensureSubscription } from "../store.js";
import type { StripeEnv } from "./sync.js";

/** Every Stripe object we create carries these. `app` lets several apps share
 *  one Stripe account; `org_id` lets a webhook resolve an org before we've
 *  stored the customer id. */
export function stamp(env: StripeEnv, ctx: BillingContext): Record<string, string> {
  return { app: env.rt.app, org_id: ctx.orgId, org_slug: ctx.orgSlug };
}

/**
 * The org's Stripe customer, created on first need and persisted immediately —
 * an abandoned checkout must not mint a second customer next time. A customer
 * deleted in the dashboard is replaced rather than failing every call after.
 */
export async function ensureCustomer(env: StripeEnv, ctx: BillingContext): Promise<string> {
  const stripe = env.stripe.client();
  const current = await ensureSubscription(env.rt, ctx.service, ctx.orgId);
  if (current.providerCustomerId && current.provider === "stripe") {
    try {
      const existing = await stripe.customers.retrieve(current.providerCustomerId);
      if (!existing.deleted) return current.providerCustomerId;
    } catch {
      // Fall through and mint a new one.
    }
  }

  const { data: org } = await ctx.service.from("orgs").select("name, slug").eq("id", ctx.orgId).maybeSingle();
  const customer = await stripe.customers.create(
    {
      name: (org?.name as string | undefined) ?? ctx.orgSlug,
      email: ctx.actorEmail ?? undefined,
      description: `${env.rt.displayName} workspace ${ctx.orgSlug}`,
      metadata: stamp(env, ctx),
    },
    { idempotencyKey: `customer:${env.rt.app}:${ctx.orgId}` },
  );

  await ctx.service
    .from("org_subscriptions")
    .update({ provider: "stripe", provider_customer_id: customer.id })
    .eq("org_id", ctx.orgId);
  return customer.id;
}

/**
 * Our payment-method row id → Stripe's `pm_…`. Looking it up through the
 * org-scoped mirror IS the authorization check: another org's row id simply
 * isn't found, so a forged id can't detach someone else's card.
 */
export async function stripePaymentMethodId(ctx: BillingContext, rowId: string): Promise<string> {
  const { data } = await ctx.service
    .from("org_payment_methods")
    .select("provider_payment_method_id")
    .eq("org_id", ctx.orgId)
    .eq("id", rowId)
    .maybeSingle();
  const stripeId = data?.provider_payment_method_id as string | undefined;
  if (!stripeId) throw new BillingError("That payment method is no longer available.");
  return stripeId;
}

/**
 * Stripe error → something a customer can read. Card errors are written for
 * end users and pass through verbatim. Everything else (auth, rate limits, our
 * own bad requests) is ours to fix: generic message out, detail to the log.
 */
export function toBillingError(error: unknown): Error {
  const stripeError = error as { type?: string; code?: string; message?: string };
  if (stripeError?.type === "StripeCardError") {
    return new BillingError(stripeError.message ?? "Your card was declined.");
  }
  if (stripeError?.code === "resource_missing") {
    return new BillingError("That billing record no longer exists in Stripe.");
  }
  console.error("[billing:stripe]", error);
  return new BillingError("Stripe couldn't complete that request. Nothing was charged — try again.");
}

/** Run a Stripe call, translating its failure for the customer. */
export async function guarded<R>(call: () => Promise<R>): Promise<R> {
  try {
    return await call();
  } catch (error) {
    throw toBillingError(error);
  }
}

