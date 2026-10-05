/**
 * What each Stripe event does to the mirror. Returns the org it touched (for
 * the idempotency row), or null when the event isn't ours to act on.
 */
import type Stripe from "stripe";
import type { Service } from "../runtime.js";
import { logBillingEvent } from "../store.js";
import { asId, invoiceSubscriptionId, readSubscription } from "./map.js";
import { readInvoice } from "./map-invoice.js";
import {
  requireFacts,
  resolveOrgForCustomer,
  syncInvoice,
  syncSubscription,
  syncSubscriptionCanceled,
  type StripeEnv,
} from "./sync.js";
import { refreshPaymentMethods } from "./sync-cards.js";

/** Events we act on. Anything else is acknowledged and dropped. */
export const HANDLED_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
  "payment_method.attached",
  "payment_method.detached",
  "customer.updated",
]);

export async function handleEvent(env: StripeEnv, service: Service, event: Stripe.Event): Promise<string | null> {
  const stripe = env.stripe.client();

  switch (event.type) {
    // Checkout finished: the subscription now exists.
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId = asId(session.customer);
      const orgId = await resolveOrgForCustomer(env, service, customerId, {
        org_id: session.client_reference_id ?? session.metadata?.org_id ?? null,
        app: session.metadata?.app ?? null,
      });
      if (!orgId || !customerId) return null;
      const subscriptionId = asId(session.subscription);
      if (!subscriptionId) return orgId;
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      await syncSubscription(env, service, orgId, requireFacts(env, subscription), null);
      await refreshPaymentMethods(service, stripe, orgId, customerId);
      return orgId;
    }

    // Created or changed from anywhere — portal edits and renewals included,
    // which is why the plan is re-read from the price, never assumed.
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const orgId = await resolveOrgForCustomer(env, service, asId(subscription.customer), subscription.metadata);
      if (!orgId) return null;
      await syncSubscription(env, service, orgId, requireFacts(env, subscription), null);
      return orgId;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const orgId = await resolveOrgForCustomer(env, service, asId(subscription.customer), subscription.metadata);
      if (!orgId) return null;
      await syncSubscriptionCanceled(env, service, orgId, null);
      return orgId;
    }

    // Money moved — or failed to. A failure is recorded and nothing is
    // revoked: Stripe's dunning retries for weeks, and pulling access on the
    // first failure punishes an expired card far more than it warrants.
    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const orgId = await resolveOrgForCustomer(env, service, asId(invoice.customer));
      if (!orgId) return null;
      await syncInvoice(service, orgId, readInvoice(invoice));
      // A payment clears past_due; a failure sets it. Re-read rather than
      // assume — it may be trialing, or already scheduled to cancel.
      const subscriptionId = invoiceSubscriptionId(invoice);
      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const facts = readSubscription(env.stripe.config(), subscription);
        if (facts) await syncSubscription(env, service, orgId, facts, null);
      }
      const paid = event.type === "invoice.paid";
      await logBillingEvent(service, orgId, event.type, null, {
        amountCents: paid ? (invoice.amount_paid ?? 0) : (invoice.amount_due ?? 0),
        number: invoice.number ?? invoice.id,
      });
      return orgId;
    }

    // Cards changed, most likely in the portal. A detached method no longer
    // names its customer, so fall back to the previous attributes.
    case "payment_method.attached":
    case "payment_method.detached": {
      const method = event.data.object as Stripe.PaymentMethod;
      const previous = event.data.previous_attributes as { customer?: unknown } | undefined;
      const customerId = asId(method.customer) ?? asId(previous?.customer);
      if (!customerId) return null;
      const orgId = await resolveOrgForCustomer(env, service, customerId);
      if (!orgId) return null;
      await refreshPaymentMethods(service, stripe, orgId, customerId);
      return orgId;
    }

    // Default payment method changed.
    case "customer.updated": {
      const customer = event.data.object as Stripe.Customer;
      const orgId = await resolveOrgForCustomer(env, service, customer.id, customer.metadata);
      if (!orgId) return null;
      await refreshPaymentMethods(service, stripe, orgId, customer.id);
      return orgId;
    }

    default:
      return null;
  }
}
