import { describe, it, expect } from "vitest";
import type Stripe from "stripe";
import {
  fromUnix,
  planForPriceId,
  priceIdFor,
  readSubscription,
  toSubscriptionStatus,
  type PriceLookup,
} from "../server/stripe/map.js";
import { readInvoice, toInvoiceStatus } from "../server/stripe/map-invoice.js";

const CONFIG: PriceLookup<"free" | "pro" | "team"> = {
  prices: {
    pro: { monthly: "price_pro_m", yearly: "price_pro_y" },
    team: { monthly: "price_team_m", yearly: "price_team_y" },
  },
};

/** Minimal Stripe-shaped subscription. Only the fields the mapper reads. */
function subscription(over: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    id: "sub_123",
    customer: "cus_123",
    status: "active",
    cancel_at_period_end: false,
    canceled_at: null,
    trial_end: null,
    currency: "usd",
    items: {
      data: [
        {
          id: "si_123",
          quantity: 3,
          // The period lives HERE in this API version, not on the subscription.
          current_period_start: 1_754_006_400, // 2025-08-01T00:00:00Z
          current_period_end: 1_756_684_800, // 2025-09-01T00:00:00Z
          price: { id: "price_pro_m", unit_amount: 1600, currency: "usd" },
        },
      ],
    },
    ...over,
  } as unknown as Stripe.Subscription;
}

describe("fromUnix", () => {
  it("converts Stripe seconds to an ISO timestamp", () => {
    expect(fromUnix(1_754_006_400)).toBe("2025-08-01T00:00:00.000Z");
  });

  it("returns null for absent or nonsense values rather than Invalid Date", () => {
    expect(fromUnix(null)).toBeNull();
    expect(fromUnix(undefined)).toBeNull();
    expect(fromUnix(Number.NaN)).toBeNull();
  });
});

describe("status mapping", () => {
  it("collapses Stripe's dunning states onto past_due", () => {
    expect(toSubscriptionStatus("past_due")).toBe("past_due");
    expect(toSubscriptionStatus("unpaid")).toBe("past_due");
    // Paused billing must NOT read as active, or paid features stay unlocked
    // while nothing is being collected.
    expect(toSubscriptionStatus("paused")).toBe("past_due");
  });

  it("treats an expired checkout as canceled, not resumable", () => {
    expect(toSubscriptionStatus("incomplete_expired")).toBe("canceled");
    expect(toSubscriptionStatus("incomplete")).toBe("incomplete");
  });

  it("maps the happy states straight through", () => {
    expect(toSubscriptionStatus("active")).toBe("active");
    expect(toSubscriptionStatus("trialing")).toBe("trialing");
    expect(toSubscriptionStatus("canceled")).toBe("canceled");
  });

  it("reads an unknown future status as incomplete, never active", () => {
    expect(toSubscriptionStatus("something_new" as Stripe.Subscription.Status)).toBe("incomplete");
  });

  it("maps invoice statuses, defaulting to open", () => {
    expect(toInvoiceStatus("paid")).toBe("paid");
    expect(toInvoiceStatus("void")).toBe("void");
    expect(toInvoiceStatus(null)).toBe("open");
  });
});

describe("price ↔ plan mapping", () => {
  it("resolves a price id in both directions", () => {
    expect(priceIdFor(CONFIG, "pro", "monthly")).toBe("price_pro_m");
    expect(priceIdFor(CONFIG, "team", "yearly")).toBe("price_team_y");
    expect(planForPriceId(CONFIG, "price_team_y")).toEqual({ plan: "team", interval: "yearly" });
  });

  it("has no price for free — it is never sold", () => {
    expect(priceIdFor(CONFIG, "free", "monthly")).toBeNull();
  });

  it("returns null for a price outside the catalog", () => {
    // This is what a price attached by hand in the Stripe dashboard looks like.
    expect(planForPriceId(CONFIG, "price_someone_made_this")).toBeNull();
    expect(planForPriceId(CONFIG, null)).toBeNull();
  });
});

describe("readSubscription", () => {
  it("reads the billing period off the ITEM, not the subscription", () => {
    // The regression this guards: in API 2025-03-31+ the period moved onto the
    // item. Reading the subscription yields undefined → "Invalid Date" on the
    // customer's renewal line.
    const facts = readSubscription(CONFIG, subscription());
    expect(facts?.currentPeriodStart).toBe("2025-08-01T00:00:00.000Z");
    expect(facts?.currentPeriodEnd).toBe("2025-09-01T00:00:00.000Z");
  });

  it("still reads an older account's subscription-level period", () => {
    const legacy = subscription({
      items: {
        data: [
          {
            id: "si_1",
            quantity: 1,
            price: { id: "price_pro_m", unit_amount: 1600, currency: "usd" },
          },
        ],
      },
      current_period_start: 1_754_006_400,
      current_period_end: 1_756_684_800,
    });
    expect(readSubscription(CONFIG, legacy)?.currentPeriodEnd).toBe("2025-09-01T00:00:00.000Z");
  });

  it("takes seats from quantity and the per-seat price from unit_amount", () => {
    const facts = readSubscription(CONFIG, subscription());
    expect(facts?.seats).toBe(3);
    // NOT 4800 — unit_amount is per seat, and multiplying here is how a 3-seat
    // workspace ends up recorded at 3× its real unit price.
    expect(facts?.unitAmountCents).toBe(1600);
    expect(facts?.plan).toBe("pro");
    expect(facts?.interval).toBe("monthly");
  });

  it("returns null for a price outside the catalog rather than guessing a plan", () => {
    const foreign = subscription({
      items: {
        data: [
          {
            id: "si_1",
            quantity: 1,
            current_period_start: 1_754_006_400,
            current_period_end: 1_756_684_800,
            price: { id: "price_unknown", unit_amount: 9900, currency: "usd" },
          },
        ],
      },
    });
    expect(readSubscription(CONFIG, foreign)).toBeNull();
  });

  it("returns null when the subscription has no items", () => {
    expect(readSubscription(CONFIG, subscription({ items: { data: [] } }))).toBeNull();
  });

  it("carries the cancellation schedule without changing the plan", () => {
    const facts = readSubscription(
      CONFIG,
      subscription({ cancel_at_period_end: true, canceled_at: 1_754_006_400 }),
    );
    expect(facts?.cancelAtPeriodEnd).toBe(true);
    expect(facts?.canceledAt).toBe("2025-08-01T00:00:00.000Z");
    // Still Pro: they paid through the period end.
    expect(facts?.plan).toBe("pro");
  });

  it("reads the customer id whether it is expanded or a bare string", () => {
    expect(readSubscription(CONFIG, subscription())?.providerCustomerId).toBe("cus_123");
    expect(
      readSubscription(CONFIG, subscription({ customer: { id: "cus_expanded" } }))
        ?.providerCustomerId,
    ).toBe("cus_expanded");
  });
});

describe("readInvoice", () => {
  function invoice(over: Record<string, unknown> = {}): Stripe.Invoice {
    return {
      id: "in_123",
      number: "DCP-0001",
      status: "paid",
      currency: "usd",
      subtotal: 1600,
      total: 1600,
      amount_paid: 1600,
      amount_due: 1600,
      created: 1_754_006_400,
      period_start: 1_754_006_400,
      period_end: 1_756_684_800,
      due_date: null,
      description: "Pro — monthly",
      hosted_invoice_url: "https://invoice.stripe.com/x",
      invoice_pdf: "https://invoice.stripe.com/x.pdf",
      status_transitions: { paid_at: 1_754_010_000 },
      lines: {
        data: [
          {
            description: "Pro × 1",
            quantity: 1,
            amount: 1600,
            period: { start: 1_754_006_400, end: 1_756_684_800 },
          },
        ],
      },
      ...over,
    } as unknown as Stripe.Invoice;
  }

  it("passes amounts through untouched — Stripe is already in cents", () => {
    const facts = readInvoice(invoice());
    expect(facts.totalCents).toBe(1600);
    expect(facts.amountPaidCents).toBe(1600);
    expect(facts.paidAt).toBe("2025-08-01T01:00:00.000Z");
  });

  it("keeps a proration credit negative", () => {
    // Our schema deliberately allows a negative total; flattening it to a
    // positive would turn a refund into a bill.
    const credit = readInvoice(
      invoice({
        total: -800,
        subtotal: -800,
        amount_paid: 0,
        lines: { data: [{ description: "Unused time", quantity: 1, amount: -800, proration: true }] },
      }),
    );
    expect(credit.totalCents).toBe(-800);
    expect(credit.lines[0]!.amountCents).toBe(-800);
    expect(credit.lines[0]!.proration).toBe(true);
  });

  it("reads the proration flag from the newer nested shape too", () => {
    const facts = readInvoice(
      invoice({
        lines: {
          data: [
            {
              description: "Remaining time",
              quantity: 1,
              amount: 400,
              parent: { subscription_item_details: { proration: true } },
            },
          ],
        },
      }),
    );
    expect(facts.lines[0]!.proration).toBe(true);
  });

  it("falls back to the invoice id when a draft has no number", () => {
    // `number` is NOT NULL and unique in our table, so a blank would fail the
    // insert rather than the mapping.
    expect(readInvoice(invoice({ number: null })).number).toBe("in_123");
  });

  it("sums a tax breakdown array as well as a scalar", () => {
    expect(readInvoice(invoice({ tax: 210 })).taxCents).toBe(210);
    expect(
      readInvoice(invoice({ tax: undefined, total_taxes: [{ amount: 100 }, { amount: 50 }] }))
        .taxCents,
    ).toBe(150);
    expect(readInvoice(invoice({ tax: undefined })).taxCents).toBe(0);
  });

  it("derives a per-unit figure from a multi-seat line", () => {
    const facts = readInvoice(
      invoice({ lines: { data: [{ description: "Pro × 4", quantity: 4, amount: 6400 }] } }),
    );
    expect(facts.lines[0]!.unitAmountCents).toBe(1600);
    expect(facts.lines[0]!.amountCents).toBe(6400);
  });

  it("keeps Stripe's hosted document links", () => {
    const facts = readInvoice(invoice());
    expect(facts.hostedUrl).toBe("https://invoice.stripe.com/x");
    expect(facts.pdfUrl).toBe("https://invoice.stripe.com/x.pdf");
  });
});
