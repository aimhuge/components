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
import { periodFrom } from "../../period.js";
import type { Runtime, Service } from "../runtime.js";
import { ensureSubscription, logBillingEvent, saveSubscription } from "../store.js";
import type { StripeHandle } from "./client.js";
import { readSubscription, stripeObjectApp, type SubscriptionFacts } from "./map.js";
import { readInvoice, type InvoiceFacts } from "./map-invoice.js";
import { refreshPaymentMethods } from "./sync-cards.js";

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
export async function resolveOrgForCustomer(
  env: StripeEnv,
  service: Service,
  customerId: string | null,
  metadata?: { org_id?: string | null; app?: string | null } | null,
): Promise<string | null> {
  if (customerId) {
    const { data } = await service
      .from("org_subscriptions")
      .select("org_id")
      .eq("provider_customer_id", customerId)
      .maybeSingle();
    if (data?.org_id) return data.org_id as string;
  }
  // Another app's metadata names another app's org — never resolve it here.
  if (metadata?.app && metadata.app !== env.rt.app) return null;
  if (metadata?.org_id) {
    // Confirm the org exists before trusting a value that arrived over the
    // wire, even a signature-verified one.
    const { data: org } = await service.from("orgs").select("id").eq("id", metadata.org_id).maybeSingle();
    if (org?.id) return org.id as string;
  }
  return null;
}

/** Write a Stripe subscription's facts onto the org. A canceled subscription
 *  drops to free only once it's actually canceled — `cancel_at_period_end`
 *  keeps the plan so the customer keeps what they paid through. */
export async function syncSubscription<P extends string>(
  env: StripeEnv<P>,
  service: Service,
  orgId: string,
  facts: SubscriptionFacts<P>,
  actorEmail: string | null,
): Promise<void> {
  const plan = facts.status === "canceled" ? env.rt.catalog.free : facts.plan;
  await saveSubscription(env.rt, service, orgId, {
    plan,
    status: facts.status,
    interval: facts.interval,
    seats: facts.seats,
    unitAmountCents: facts.unitAmountCents,
    currentPeriodStart: facts.currentPeriodStart,
    currentPeriodEnd: facts.currentPeriodEnd,
    cancelAtPeriodEnd: facts.cancelAtPeriodEnd,
    canceledAt: facts.canceledAt,
    trialEnd: facts.trialEnd,
    provider: "stripe",
    providerCustomerId: facts.providerCustomerId,
    providerSubscriptionId: facts.providerSubscriptionId,
  });
  await logBillingEvent(service, orgId, "subscription.synced", actorEmail, {
    plan,
    status: facts.status,
    seats: facts.seats,
    stripeSubscriptionId: facts.providerSubscriptionId,
  });
}

/**
 * Drop an org to free after its Stripe subscription ends. Opens a fresh monthly
 * period (usage is measured against it; a period that ended last Tuesday would
 * freeze every allowance). The customer id is KEPT: a returning customer
 * reuses their cards and invoice history instead of becoming a second customer.
 */
export async function syncSubscriptionCanceled(
  env: StripeEnv,
  service: Service,
  orgId: string,
  actorEmail: string | null,
): Promise<void> {
  await ensureSubscription(env.rt, service, orgId);
  const period = periodFrom(new Date(), "monthly");
  await saveSubscription(env.rt, service, orgId, {
    plan: env.rt.catalog.free,
    status: "active",
    interval: "monthly",
    seats: 1,
    unitAmountCents: 0,
    currentPeriodStart: period.start,
    currentPeriodEnd: period.end,
    cancelAtPeriodEnd: false,
    canceledAt: new Date().toISOString(),
    trialEnd: null,
    providerSubscriptionId: null,
  });
  await logBillingEvent(service, orgId, "subscription.ended", actorEmail);
}

/**
 * Upsert a Stripe invoice, keyed on `(provider, provider_invoice_id)` — the
 * identity that never changes; `number` is null on a draft. A redelivered
 * `invoice.paid` updates its own row. Zero invoices (a $0 trial, a change that
 * nets to nothing) are skipped as noise in a list about what was charged.
 */
export async function syncInvoice(service: Service, orgId: string, facts: InvoiceFacts): Promise<void> {
  if (!facts.providerInvoiceId) return;
  if (facts.totalCents === 0 && facts.amountPaidCents === 0) return;
  const { error } = await service.from("org_invoices").upsert(
    {
      org_id: orgId,
      number: facts.number,
      status: facts.status,
      currency: facts.currency,
      subtotal_cents: facts.subtotalCents,
      tax_cents: facts.taxCents,
      total_cents: facts.totalCents,
      amount_paid_cents: facts.amountPaidCents,
      period_start: facts.periodStart,
      period_end: facts.periodEnd,
      issued_at: facts.issuedAt,
      paid_at: facts.paidAt,
      due_at: facts.dueAt,
      description: facts.description,
      lines: facts.lines,
      provider: "stripe",
      provider_invoice_id: facts.providerInvoiceId,
      hosted_url: facts.hostedUrl,
      pdf_url: facts.pdfUrl,
    },
    { onConflict: "provider,provider_invoice_id" },
  );
  if (error) throw new Error(`Invoice sync failed: ${error.message}`);
}

/** Facts for a subscription, or a loud failure: a price outside the catalog
 *  means an org would sit on a plan the app can't reason about. */
export function requireFacts<P extends string>(
  env: StripeEnv<P>,
  subscription: Stripe.Subscription,
): SubscriptionFacts<P> {
  const facts = readSubscription(env.stripe.config(), subscription);
  if (!facts) {
    throw new Error(
      `Stripe subscription ${subscription.id} (app ${stripeObjectApp(subscription) ?? "unstamped"}) carries a ` +
        `price that is not in ${env.rt.app}'s catalog. Check STRIPE_PRICE_* against the subscription's price.`,
    );
  }
  return facts;
}

/** Fetch a subscription and mirror what Stripe actually did — never our echo. */
export async function refreshSubscription(
  env: StripeEnv,
  service: Service,
  orgId: string,
  subscriptionId: string,
  actorEmail: string | null,
): Promise<void> {
  const subscription = await env.stripe.client().subscriptions.retrieve(subscriptionId);
  await syncSubscription(env, service, orgId, requireFacts(env, subscription), actorEmail);
}

/**
 * Re-read everything Stripe knows about an org and mirror it — right after a
 * checkout redirect (the customer is back before the webhook), or as a repair.
 * Asks for the customer's LIVE subscription rather than trusting the stored id,
 * so it also recovers one created outside our flow. No live subscription drops
 * the org to free: a reconciliation, not a cancellation.
 */
export async function reconcileFromStripe(
  env: StripeEnv,
  service: Service,
  orgId: string,
  actorEmail: string | null,
): Promise<void> {
  const stripe = env.stripe.client();
  const current = await ensureSubscription(env.rt, service, orgId);
  const customerId = current.providerCustomerId;
  if (!customerId || current.provider !== "stripe") return;

  const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 10 });
  // Live = still entitling the customer; past_due is live until dunning gives up.
  const live = subscriptions.data.find((s) => ["active", "trialing", "past_due", "unpaid"].includes(s.status));
  if (!live) {
    if (current.providerSubscriptionId) await syncSubscriptionCanceled(env, service, orgId, actorEmail);
    return;
  }
  const facts = readSubscription(env.stripe.config(), live);
  if (!facts) return;
  await syncSubscription(env, service, orgId, facts, actorEmail);
  await refreshPaymentMethods(service, stripe, orgId, customerId);

  // Bring invoice history along, so a receipt is there the moment someone looks.
  const invoices = await stripe.invoices.list({ customer: customerId, limit: 24 });
  for (const invoice of invoices.data) await syncInvoice(service, orgId, readInvoice(invoice));
}
