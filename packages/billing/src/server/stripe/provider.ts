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
import { BillingError } from "../../errors.js";
import { clampSeats } from "../../period.js";
import type { PaymentMethod, Subscription } from "../../types.js";
import { stripeBrandingSettings } from "../branding.js";
import type { BillingContext, BillingProvider, ChangePlanInput } from "../provider.js";
import { ensureSubscription, loadSubscription } from "../store.js";
import { isTestKey } from "./client.js";
import { ensureCustomer, guarded, stamp, stripePaymentMethodId } from "./customer.js";
import { priceIdFor } from "./map.js";
import { reconcileFromStripe, refreshSubscription, syncSubscriptionCanceled, type StripeEnv } from "./sync.js";
import { refreshPaymentMethods } from "./sync-cards.js";

export function createStripeProvider<P extends string, T extends BasePlan<P>>(
  env: StripeEnv<P, T>,
): BillingProvider<P> {
  const { rt, stripe } = env;
  const free = rt.catalog.free;

  async function changePlan(ctx: BillingContext, input: ChangePlanInput<P>): Promise<Subscription<P>> {
    const current = await ensureSubscription(rt, ctx.service, ctx.orgId);
    const seats = clampSeats(input.seats);

    if (input.plan === free) {
      if (!current.providerSubscriptionId) return current;
      // Cancel now with proration: Stripe credits the unused remainder to the
      // customer's balance — the mock's semantics, so both behave alike.
      await guarded(() =>
        stripe.client().subscriptions.cancel(current.providerSubscriptionId!, { prorate: true, invoice_now: true }),
      );
      await syncSubscriptionCanceled(env, ctx.service, ctx.orgId, ctx.actorEmail);
      return loadSubscription(rt, ctx.service, ctx.orgId);
    }

    const price = priceIdFor(stripe.config(), input.plan, input.interval);
    if (!price) throw new BillingError("That plan isn't available right now.");
    // No subscription to modify: Checkout has to collect a payment method.
    if (!current.providerSubscriptionId) throw new BillingError("Start a checkout to move onto a paid plan.");

    const subscriptionId = current.providerSubscriptionId;
    const subscription = await guarded(() => stripe.client().subscriptions.retrieve(subscriptionId));
    const item = subscription.items?.data?.[0];
    if (!item) throw new BillingError("That subscription has no billable item. Contact support.");

    await guarded(() =>
      stripe.client().subscriptions.update(subscriptionId, {
        // Replace the item, not add one — omitting its id bills old AND new.
        items: [{ id: item.id, price, quantity: seats }],
        proration_behavior: "create_prorations",
        payment_behavior: "error_if_incomplete",
        cancel_at_period_end: false,
        metadata: stamp(env, ctx),
      }),
    );
    await refreshSubscription(env, ctx.service, ctx.orgId, subscriptionId, ctx.actorEmail);
    return loadSubscription(rt, ctx.service, ctx.orgId);
  }

  async function setCancelAtPeriodEnd(ctx: BillingContext, cancel: boolean): Promise<Subscription<P>> {
    const current = await ensureSubscription(rt, ctx.service, ctx.orgId);
    if (cancel && current.plan === free) throw new BillingError("The free plan has nothing to cancel.");
    if (!current.providerSubscriptionId) {
      if (cancel) throw new BillingError("No active subscription found to cancel.");
      return current;
    }
    if (!cancel && !current.cancelAtPeriodEnd) return current;
    const subscriptionId = current.providerSubscriptionId;
    await guarded(() => stripe.client().subscriptions.update(subscriptionId, { cancel_at_period_end: cancel }));
    await refreshSubscription(env, ctx.service, ctx.orgId, subscriptionId, ctx.actorEmail);
    return loadSubscription(rt, ctx.service, ctx.orgId);
  }

  async function customerIdOrThrow(ctx: BillingContext): Promise<string> {
    const current = await ensureSubscription(rt, ctx.service, ctx.orgId);
    if (!current.providerCustomerId) throw new BillingError("No billing customer for this workspace.");
    return current.providerCustomerId;
  }

  return {
    id: "stripe",
    // Getters: the key isn't required until Stripe is actually used.
    get label() {
      return isTestKey(stripe.config().secretKey) ? "Stripe (test mode)" : "Stripe";
    },
    hostedCheckout: true,
    get live() {
      return !isTestKey(stripe.config().secretKey);
    },
    managesPaymentMethodsExternally: true,

    async startCheckout(ctx, input) {
      // Leaving a paid plan is ending the subscription — changePlan's job.
      if (input.plan === free) return { kind: "applied", subscription: await changePlan(ctx, input) };

      // A live subscription is modified in place: a second Checkout would
      // create a SECOND subscription and bill them twice.
      const current = await ensureSubscription(rt, ctx.service, ctx.orgId);
      if (current.providerSubscriptionId && current.status !== "canceled") {
        return { kind: "applied", subscription: await changePlan(ctx, input) };
      }

      const price = priceIdFor(stripe.config(), input.plan, input.interval);
      if (!price) throw new BillingError("That plan isn't available for purchase right now.");
      const seats = clampSeats(input.seats);
      const customer = await ensureCustomer(env, ctx);
      const returnUrl = `${stripe.config().siteOrigin}${input.returnPath}`;
      const metadata = stamp(env, ctx);

      const session = await guarded(() =>
        stripe.client().checkout.sessions.create(
          {
            mode: "subscription",
            customer,
            line_items: [{ price, quantity: seats }],
            // `?checkout=done` is a hint for the UI, never a grant — anyone can
            // type it. The plan changes when reconcile or the webhook confirms.
            success_url: `${returnUrl}?checkout=done&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${returnUrl}?checkout=canceled`,
            // The session's metadata is read at checkout.session.completed; the
            // subscription's rides on every later subscription event.
            metadata,
            subscription_data: { metadata },
            client_reference_id: ctx.orgId,
            allow_promotion_codes: true,
            billing_address_collection: "auto",
            payment_method_collection: "always",
            // This app's name and logo over the shared account's (../branding.ts).
            ...(rt.checkoutBranding && { branding_settings: stripeBrandingSettings(rt.checkoutBranding) }),
          },
          // A double click within Stripe's idempotency window reuses the session.
          { idempotencyKey: `checkout:${rt.app}:${ctx.orgId}:${input.plan}:${input.interval}:${seats}` },
        ),
      );
      if (!session.url) throw new BillingError("Stripe didn't return a checkout page. Try again.");
      return { kind: "redirect", url: session.url };
    },

    changePlan,
    cancelSubscription: (ctx) => setCancelAtPeriodEnd(ctx, true),
    resumeSubscription: (ctx) => setCancelAtPeriodEnd(ctx, false),

    /** `token` is a `pm_…` from Stripe.js. The portal normally owns this flow;
     *  it exists for an app that adds Stripe Elements later. */
    async attachPaymentMethod(ctx, input): Promise<PaymentMethod> {
      if (!input.token.startsWith("pm_")) throw new BillingError("That payment method couldn't be read. Try again.");
      const customer = await ensureCustomer(env, ctx);
      const method = await guarded(async () => {
        const attached = await stripe.client().paymentMethods.attach(input.token, { customer });
        if (input.makeDefault) {
          await stripe.client().customers.update(customer, {
            invoice_settings: { default_payment_method: attached.id },
          });
        }
        return attached;
      });
      await refreshPaymentMethods(ctx.service, stripe.client(), ctx.orgId, customer);
      return {
        id: method.id,
        brand: method.card?.brand ?? "card",
        last4: method.card?.last4 ?? "0000",
        expMonth: method.card?.exp_month ?? 1,
        expYear: method.card?.exp_year ?? 2100,
        holderName: method.billing_details?.name ?? null,
        isDefault: input.makeDefault,
        createdAt: new Date(method.created * 1000).toISOString(),
      };
    },

    async detachPaymentMethod(ctx, paymentMethodId) {
      const customer = await customerIdOrThrow(ctx);
      const current = await ensureSubscription(rt, ctx.service, ctx.orgId);
      const stripeId = await stripePaymentMethodId(ctx, paymentMethodId);
      // The last card off a paid plan would renew against nothing a month later.
      const methods = await stripe.client().paymentMethods.list({ customer, type: "card", limit: 20 });
      if (methods.data.length <= 1 && current.unitAmountCents > 0) {
        throw new BillingError("This is the only card on a paid plan. Add another first, or switch to Free.");
      }
      await guarded(() => stripe.client().paymentMethods.detach(stripeId));
      await refreshPaymentMethods(ctx.service, stripe.client(), ctx.orgId, customer);
    },

    async setDefaultPaymentMethod(ctx, paymentMethodId) {
      const customer = await customerIdOrThrow(ctx);
      const stripeId = await stripePaymentMethodId(ctx, paymentMethodId);
      await guarded(() =>
        stripe.client().customers.update(customer, { invoice_settings: { default_payment_method: stripeId } }),
      );
      await refreshPaymentMethods(ctx.service, stripe.client(), ctx.orgId, customer);
    },

    /** Stripe's own hosted billing UI: cards, invoices, cancellation. */
    async billingPortalUrl(ctx, returnPath) {
      const current = await ensureSubscription(rt, ctx.service, ctx.orgId);
      // No customer = nothing ever bought; the UI should offer checkout.
      if (!current.providerCustomerId || current.provider !== "stripe") return null;
      const customer = current.providerCustomerId;
      const session = await guarded(() =>
        stripe.client().billingPortal.sessions.create({
          customer,
          return_url: `${stripe.config().siteOrigin}${returnPath}`,
        }),
      );
      return session.url;
    },

    reconcile: (ctx) => reconcileFromStripe(env, ctx.service, ctx.orgId, ctx.actorEmail),
  };
}
