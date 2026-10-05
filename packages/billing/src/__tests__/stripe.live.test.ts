import { describe, expect, it } from "vitest";
import Stripe from "stripe";
import { STRIPE_API_VERSION, isTestKey } from "../server/stripe/client.js";
import { planForPriceId, readSubscription, type PriceLookup } from "../server/stripe/map.js";
import { readInvoice } from "../server/stripe/map-invoice.js";

/**
 * The Stripe adapter's mapping, exercised against the REAL Stripe API.
 *
 * **Skipped unless `STRIPE_LIVE=1`.** Run it with `pnpm test:stripe-live`, with
 * STRIPE_SECRET_KEY (a TEST key), STRIPE_WEBHOOK_SECRET and the four
 * STRIPE_PRICE_{PRO,TEAM}_{MONTHLY,YEARLY} of any test-mode account in the env.
 * Visible-but-skipped rather than hidden, same as the erasure live test, so
 * nobody forgets it exists.
 *
 * Why it has to be live: every unit test in stripe-map.test.ts asserts against
 * a hand-written fixture, which means it proves the mapper is self-consistent, not
 * that it matches what Stripe actually sends. The one class of bug that matters
 * most here — a field that moved between API versions, like `current_period_*`
 * migrating onto subscription items — is invisible to a hand-written fixture
 * and obvious within seconds of running this.
 *
 * It creates and then deletes real objects in Stripe TEST mode: a customer, a
 * subscription, an upgrade with proration, and a cancellation. No browser is
 * needed — Checkout's outcome is a subscription, and a subscription can be
 * created directly with a test payment method.
 */

const LIVE = !!process.env.STRIPE_LIVE;

function config(): PriceLookup<"pro" | "team"> {
  return {
    prices: {
      pro: {
        monthly: process.env.STRIPE_PRICE_PRO_MONTHLY ?? "",
        yearly: process.env.STRIPE_PRICE_PRO_YEARLY ?? "",
      },
      team: {
        monthly: process.env.STRIPE_PRICE_TEAM_MONTHLY ?? "",
        yearly: process.env.STRIPE_PRICE_TEAM_YEARLY ?? "",
      },
    },
  };
}

describe.skipIf(!LIVE)("stripe adapter against the live test-mode API", () => {
  it("runs a full subscription lifecycle and maps every state correctly", async () => {
    const key = process.env.STRIPE_SECRET_KEY ?? "";

    // The single most important line in this file. A live key here would create
    // a real customer and a real subscription and charge a real card.
    expect(isTestKey(key), "STRIPE_SECRET_KEY must be a TEST key (sk_test_…)").toBe(true);

    const stripe = new Stripe(key, { apiVersion: STRIPE_API_VERSION });
    const prices = config();
    expect(prices.prices.pro!.monthly, "STRIPE_PRICE_PRO_MONTHLY must be set").toBeTruthy();
    expect(prices.prices.team!.yearly, "STRIPE_PRICE_TEAM_YEARLY must be set").toBeTruthy();

    let customerId: string | null = null;

    try {
      // ── A customer with a working test card ────────────────────────────────
      const customer = await stripe.customers.create({
        name: "@aimhuge/billing live-test workspace",
        metadata: { app: "billing-live-test", org_id: "00000000-0000-0000-0000-000000000000", live_test: "1" },
      });
      customerId = customer.id;

      // `pm_card_visa` is Stripe's always-succeeds test payment method.
      const method = await stripe.paymentMethods.attach("pm_card_visa", { customer: customerId });
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: method.id },
      });

      // ── Subscribe: 3 seats of Pro monthly ─────────────────────────────────
      const created = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: prices.prices.pro!.monthly, quantity: 3 }],
        metadata: { app: "billing-live-test", org_id: "00000000-0000-0000-0000-000000000000" },
      });

      const facts = readSubscription(prices, created);
      expect(facts, "a subscription on a catalog price must map").not.toBeNull();
      expect(facts!.plan).toBe("pro");
      expect(facts!.interval).toBe("monthly");
      expect(facts!.seats).toBe(3);

      // The period-moved-to-items regression, checked against real API output
      // rather than a fixture that could encode the same mistake.
      expect(Number.isNaN(Date.parse(facts!.currentPeriodStart))).toBe(false);
      expect(Number.isNaN(Date.parse(facts!.currentPeriodEnd))).toBe(false);
      expect(new Date(facts!.currentPeriodEnd).getTime()).toBeGreaterThan(
        new Date(facts!.currentPeriodStart).getTime(),
      );

      // ── Upgrade mid-period: Team yearly, 5 seats ──────────────────────────
      const item = created.items.data[0]!;
      const upgraded = await stripe.subscriptions.update(created.id, {
        items: [{ id: item.id, price: prices.prices.team!.yearly, quantity: 5 }],
        proration_behavior: "create_prorations",
      });

      const afterUpgrade = readSubscription(prices, upgraded);
      expect(afterUpgrade!.plan).toBe("team");
      expect(afterUpgrade!.interval).toBe("yearly");
      expect(afterUpgrade!.seats).toBe(5);
      expect(planForPriceId(prices, upgraded.items.data[0]!.price.id)).toEqual({
        plan: "team",
        interval: "yearly",
      });

      // Stripe should have generated proration lines. Reading them back proves
      // the invoice mapper handles a real credit, not just a synthetic one.
      const invoices = await stripe.invoices.list({ customer: customerId, limit: 10 });
      expect(invoices.data.length).toBeGreaterThan(0);
      for (const invoice of invoices.data) {
        const mapped = readInvoice(invoice);
        expect(mapped.providerInvoiceId).toBeTruthy();
        expect(mapped.number, "every invoice must yield a non-empty number").toBeTruthy();
        expect(Number.isFinite(mapped.totalCents)).toBe(true);
      }

      // ── Schedule cancellation ─────────────────────────────────────────────
      const canceling = await stripe.subscriptions.update(created.id, {
        cancel_at_period_end: true,
      });
      const afterCancel = readSubscription(prices, canceling);
      expect(afterCancel!.cancelAtPeriodEnd).toBe(true);
      // Still Team — they paid through the period end, and dropping the plan
      // here would revoke features they have already been charged for.
      expect(afterCancel!.plan).toBe("team");
      expect(afterCancel!.status).toBe("active");

      // ── End it ────────────────────────────────────────────────────────────
      const ended = await stripe.subscriptions.cancel(created.id, { prorate: true });
      expect(readSubscription(prices, ended)!.status).toBe("canceled");
    } finally {
      // Always clean up, even on a failed assertion — a leaked test customer
      // with a live subscription keeps generating invoices forever.
      if (customerId) await stripe.customers.del(customerId).catch(() => {});
    }
  }, 120_000);

  it("rejects a price that is not in the catalog instead of guessing a plan", async () => {
    const key = process.env.STRIPE_SECRET_KEY ?? "";
    expect(isTestKey(key)).toBe(true);

    const stripe = new Stripe(key, { apiVersion: STRIPE_API_VERSION });
    const prices = config();

    // A price nobody put in the catalog — the shape of "someone added a product
    // in the Stripe dashboard". It must not silently become a paid plan.
    const product = await stripe.products.create({ name: "@aimhuge/billing live-test rogue product" });
    const rogue = await stripe.prices.create({
      product: product.id,
      currency: "usd",
      unit_amount: 9900,
      recurring: { interval: "month" },
    });

    expect(planForPriceId(prices, rogue.id)).toBeNull();

    await stripe.prices.update(rogue.id, { active: false }).catch(() => {});
    await stripe.products.update(product.id, { active: false }).catch(() => {});
  }, 60_000);

  it("verifies webhook signatures and rejects forged ones", async () => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
    expect(secret, "STRIPE_WEBHOOK_SECRET must be set").toBeTruthy();

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
      apiVersion: STRIPE_API_VERSION,
    });
    const payload = JSON.stringify({ id: "evt_test", type: "invoice.paid", data: { object: {} } });

    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
    const event = await stripe.webhooks.constructEventAsync(payload, header, secret);
    expect(event.id).toBe("evt_test");

    // The property the whole endpoint rests on: a payload that wasn't signed
    // with our secret must not verify. Without this, an app's webhook route is an
    // unauthenticated "upgrade any org to Team" endpoint.
    const forged = stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_wrong" });
    await expect(
      stripe.webhooks.constructEventAsync(payload, forged, secret),
    ).rejects.toThrow();

    // And a body altered after signing must fail too — this is why the route
    // reads req.text() rather than re-serializing parsed JSON.
    const tampered = payload.replace("invoice.paid", "invoice.void");
    await expect(
      stripe.webhooks.constructEventAsync(tampered, header, secret),
    ).rejects.toThrow();
  }, 30_000);
});
