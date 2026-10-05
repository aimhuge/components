import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { createBilling } from "../server/create.js";
import { fakeSupabase } from "./fake-supabase.js";
import { deckCatalog } from "./fixtures.js";

const SECRET = "whsec_test_secret";
const ORG = "22222222-2222-2222-2222-222222222222";

const billing = createBilling({
  app: "deckcp",
  displayName: "DeckCP",
  catalog: deckCatalog,
  invoicePrefix: "DCP",
  env: {
    BILLING_PROVIDER: "stripe",
    STRIPE_SECRET_KEY: "sk_test_not_a_real_key",
    STRIPE_WEBHOOK_SECRET: SECRET,
    STRIPE_PRICE_PRO_MONTHLY: "price_pro_m",
    STRIPE_PRICE_PRO_YEARLY: "price_pro_y",
    STRIPE_PRICE_TEAM_MONTHLY: "price_team_m",
    STRIPE_PRICE_TEAM_YEARLY: "price_team_y",
  },
});

function signed(event: Record<string, unknown>, secret = SECRET): Request {
  const payload = JSON.stringify(event);
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  return new Request("https://app.test/api/billing/webhook", {
    method: "POST",
    headers: { "stripe-signature": header },
    body: payload,
  });
}

const event = (id: string, type: string, object: Record<string, unknown>) => ({
  id,
  object: "event",
  type,
  data: { object },
});

const subscription = (over: Record<string, unknown> = {}) => ({
  id: "sub_1",
  object: "subscription",
  customer: "cus_1",
  status: "active",
  metadata: { app: "deckcp", org_id: ORG },
  items: { data: [{ id: "si_1", quantity: 1, current_period_start: 1_790_000_000, current_period_end: 1_792_600_000, price: { id: "price_pro_m", unit_amount: 1600, currency: "usd" } }] },
  ...over,
});

describe("handleStripeWebhook", () => {
  it("rejects a missing or forged signature with 400 — it will never become valid", async () => {
    const db = fakeSupabase();
    const noSig = new Request("https://app.test/hook", { method: "POST", body: "{}" });
    expect((await billing.handleStripeWebhook(noSig, () => db.service)).status).toBe(400);
    const forged = signed(event("evt_1", "customer.updated", {}), "whsec_wrong");
    expect((await billing.handleStripeWebhook(forged, () => db.service)).status).toBe(400);
    expect(db.calls).toEqual([]);
  });

  it("acknowledges another app's event on a shared account without touching the database", async () => {
    const db = fakeSupabase();
    const foreign = signed(
      event("evt_2", "customer.subscription.updated", subscription({ metadata: { app: "blastcp", org_id: "x" }, items: { data: [{ price: { id: "price_blast_agency" } }] } })),
    );
    const res = await billing.handleStripeWebhook(foreign, () => db.service);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ignored: "other app", app: "blastcp" });
    expect(db.calls).toEqual([]);
  });

  it("claims an event once; a redelivery is a 200 duplicate", async () => {
    const db = fakeSupabase();
    const body = event("evt_3", "charge.refunded", {});
    expect(await (await billing.handleStripeWebhook(signed(body), () => db.service)).json()).toMatchObject({ ignored: true });
    expect(await (await billing.handleStripeWebhook(signed(body), () => db.service)).json()).toMatchObject({ duplicate: true });
    expect(db.tables.billing_webhook_events).toHaveLength(1);
  });

  it("drops an org to free when its subscription is deleted, keeping the customer", async () => {
    const db = fakeSupabase({
      orgs: [{ id: ORG }],
      org_subscriptions: [
        { org_id: ORG, plan: "pro", status: "active", billing_interval: "monthly", seats: 1, unit_amount_cents: 1600, currency: "usd", current_period_start: "2026-10-01T00:00:00.000Z", current_period_end: "2026-11-01T00:00:00.000Z", cancel_at_period_end: false, canceled_at: null, trial_end: null, provider: "stripe", provider_customer_id: "cus_1", provider_subscription_id: "sub_1" },
      ],
    });
    const res = await billing.handleStripeWebhook(signed(event("evt_4", "customer.subscription.deleted", subscription())), () => db.service);
    expect(res.status).toBe(200);
    expect(db.tables.org_subscriptions![0]).toMatchObject({
      plan: "free",
      unit_amount_cents: 0,
      provider_customer_id: "cus_1",
      provider_subscription_id: null,
    });
    expect(db.tables.billing_webhook_events![0]).toMatchObject({ id: "evt_4", org_id: ORG, error: null });
  });

  it("fails an unknown price of OUR app loudly, and releases the claim so Stripe's retry re-runs", async () => {
    const db = fakeSupabase({ orgs: [{ id: ORG }] });
    const odd = subscription({ items: { data: [{ id: "si_1", quantity: 1, current_period_start: 1, current_period_end: 2, price: { id: "price_not_in_catalog" } }] } });
    const res = await billing.handleStripeWebhook(signed(event("evt_5", "customer.subscription.updated", odd)), () => db.service);
    expect(res.status).toBe(500);
    expect(db.tables.billing_webhook_events).toHaveLength(0);
  });

  it("answers 500 when there's no database, so Stripe retries", async () => {
    const res = await billing.handleStripeWebhook(signed(event("evt_6", "customer.updated", {})), () => null);
    expect(res.status).toBe(500);
  });
});
