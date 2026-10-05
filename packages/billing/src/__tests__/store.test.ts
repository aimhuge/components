import { describe, expect, it, vi } from "vitest";
import { createBilling } from "../server/create.js";
import { InsufficientCredit } from "../errors.js";
import { fakeSupabase } from "./fake-supabase.js";
import { blastCatalog, deckCatalog, IMAGE_METER } from "./fixtures.js";

const ORG = "11111111-1111-1111-1111-111111111111";

function subRow(over: Record<string, unknown> = {}) {
  return {
    org_id: ORG,
    plan: "free",
    status: "active",
    billing_interval: "monthly",
    seats: 1,
    unit_amount_cents: 0,
    currency: "usd",
    current_period_start: "2026-05-15T00:00:00.000Z",
    current_period_end: "2026-06-15T00:00:00.000Z",
    cancel_at_period_end: false,
    canceled_at: null,
    trial_end: null,
    provider: "mock",
    provider_customer_id: null,
    provider_subscription_id: null,
    ...over,
  };
}

const deck = (onPlanChange = vi.fn()) =>
  createBilling({ app: "deckcp", displayName: "DeckCP", catalog: deckCatalog, invoicePrefix: "DCP", onPlanChange, env: {} });

describe("subscription", () => {
  it("opens a free row on first touch", async () => {
    const db = fakeSupabase();
    const sub = await deck().subscription(db.service, ORG);
    expect(sub.plan).toBe("free");
    expect(db.tables.org_subscriptions).toHaveLength(1);
  });

  it("rolls a lapsed free period forward and persists it", async () => {
    const db = fakeSupabase({ org_subscriptions: [subRow()] });
    const sub = await deck().subscription(db.service, ORG);
    expect(new Date(sub.currentPeriodEnd).getTime()).toBeGreaterThan(Date.now());
    expect(sub.currentPeriodStart.slice(8, 10)).toBe("15");
    expect(db.tables.org_subscriptions![0]!.current_period_end).toBe(sub.currentPeriodEnd);
  });

  it("never rolls a paid period — that's the provider's job", async () => {
    const db = fakeSupabase({ org_subscriptions: [subRow({ plan: "pro", unit_amount_cents: 1600 })] });
    const sub = await deck().subscription(db.service, ORG);
    expect(sub.currentPeriodEnd).toBe("2026-06-15T00:00:00.000Z");
  });

  it("rolls a comped ($0) plan, but not one Stripe still owns", async () => {
    const comped = fakeSupabase({ org_subscriptions: [subRow({ plan: "pro" })] });
    expect((await deck().subscription(comped.service, ORG)).currentPeriodEnd).not.toBe("2026-06-15T00:00:00.000Z");

    const stripeOwned = fakeSupabase({
      org_subscriptions: [subRow({ provider: "stripe", provider_subscription_id: "sub_1", status: "trialing" })],
    });
    expect((await deck().subscription(stripeOwned.service, ORG)).currentPeriodEnd).toBe("2026-06-15T00:00:00.000Z");
  });

  it("reads an unknown plan as free", async () => {
    const db = fakeSupabase({ org_subscriptions: [subRow({ plan: "enterprise", unit_amount_cents: 99 })] });
    expect((await deck().subscription(db.service, ORG)).plan).toBe("free");
  });
});

describe("onPlanChange", () => {
  it("fires on a tier change only, and never fails the write", async () => {
    const hook = vi.fn().mockRejectedValue(new Error("cache down"));
    const billing = deck(hook);
    const db = fakeSupabase({ org_subscriptions: [subRow()] });

    await billing.saveSubscription(db.service, ORG, { seats: 3 });
    expect(hook).not.toHaveBeenCalled();

    const saved = await billing.saveSubscription(db.service, ORG, { plan: "pro" });
    expect(saved.plan).toBe("pro");
    expect(hook).toHaveBeenCalledWith(expect.objectContaining({ orgId: ORG, from: "free", to: "pro" }));
  });
});

describe("setPlanByAdmin", () => {
  it("comps a change at $0 and logs it", async () => {
    const db = fakeSupabase({ org_subscriptions: [subRow()] });
    const result = await deck().setPlanByAdmin(db.service, { orgId: ORG, plan: "team", actorEmail: "ops@x.com" });
    expect(result).toEqual({ from: "free", to: "team", changed: true });
    expect(db.tables.org_subscriptions![0]).toMatchObject({ plan: "team", unit_amount_cents: 0 });
    expect(db.tables.org_billing_events![0]).toMatchObject({ kind: "plan.comped", actor_email: "ops@x.com" });
  });

  it("writes nothing when the tier is unchanged", async () => {
    const db = fakeSupabase({ org_subscriptions: [subRow({ plan: "pro", unit_amount_cents: 1600, current_period_end: "2099-01-01T00:00:00.000Z" })] });
    const result = await deck().setPlanByAdmin(db.service, { orgId: ORG, plan: "pro", actorEmail: null });
    expect(result.changed).toBe(false);
    expect(db.tables.org_subscriptions![0]!.unit_amount_cents).toBe(1600);
  });

  it("refuses a live Stripe subscription — its webhook would revert the edit", async () => {
    const db = fakeSupabase({
      org_subscriptions: [subRow({ plan: "pro", provider: "stripe", provider_subscription_id: "sub_1", unit_amount_cents: 1600 })],
    });
    await expect(deck().setPlanByAdmin(db.service, { orgId: ORG, plan: "team", actorEmail: null })).rejects.toThrow(/Stripe/);
  });
});

describe("usage ledger", () => {
  const blast = (meteredStatuses?: ("active" | "trialing")[]) =>
    createBilling({ app: "blastcp", displayName: "BlastCP", catalog: blastCatalog, invoicePrefix: "BCP", meteredStatuses, env: {} });
  const period = { current_period_start: "2026-10-01T00:00:00.000Z", current_period_end: "2099-01-01T00:00:00.000Z" };

  it("draws this period's usage and active grants against the plan's allowance", async () => {
    const db = fakeSupabase({
      org_subscriptions: [subRow({ plan: "pro", unit_amount_cents: 3900, ...period })],
      org_usage_charges: [
        { org_id: ORG, meter: IMAGE_METER, amount: 75_000, created_at: "2026-10-03T00:00:00.000Z" },
        // Last period: doesn't count against this one.
        { org_id: ORG, meter: IMAGE_METER, amount: 9_000_000, created_at: "2026-09-20T00:00:00.000Z" },
      ],
      org_credit_grants: [{ org_id: ORG, meter: IMAGE_METER, amount: 1_000_000, expires_at: null }],
    });
    const balance = await blast().balance(db.service, ORG, IMAGE_METER);
    expect(balance.remaining).toBe(10_000_000 + 1_000_000 - 75_000);
  });

  it("spends on the free allowance — lifetime — once payment lapses", async () => {
    const db = fakeSupabase({
      org_subscriptions: [subRow({ plan: "pro", status: "past_due", unit_amount_cents: 3900, ...period })],
      org_usage_charges: [{ org_id: ORG, meter: IMAGE_METER, amount: 400_000, created_at: "2026-01-01T00:00:00.000Z" }],
    });
    const balance = await blast(["active", "trialing"]).balance(db.service, ORG, IMAGE_METER);
    expect(balance.allowance).toBe(500_000);
    expect(balance.remaining).toBe(100_000);
  });

  it("refuses work the org can't afford, with the numbers", async () => {
    const db = fakeSupabase({ org_subscriptions: [subRow({ ...period })] });
    const billing = blast();
    await billing.recordUsage(db.service, { orgId: ORG, meter: IMAGE_METER, amount: 450_000 });
    const refusal = billing.assertCanAfford(db.service, ORG, IMAGE_METER, 75_000);
    await expect(refusal).rejects.toBeInstanceOf(InsufficientCredit);
    await expect(refusal).rejects.toMatchObject({ remaining: 50_000, price: 75_000 });
  });

  it("rejects a fractional charge rather than storing a float", async () => {
    const db = fakeSupabase();
    await expect(blast().recordUsage(db.service, { orgId: ORG, meter: IMAGE_METER, amount: 0.5 })).rejects.toThrow(/integer/);
  });

  it("logs a grant to the audit trail", async () => {
    const db = fakeSupabase();
    await blast().grantCredit(db.service, { orgId: ORG, meter: IMAGE_METER, amount: 2_000_000, reason: "sorry", grantedBy: "ops@x.com" });
    expect(db.tables.org_credit_grants).toHaveLength(1);
    expect(db.tables.org_billing_events![0]).toMatchObject({ kind: "credit.granted" });
  });
});
