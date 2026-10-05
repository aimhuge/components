import { describe, expect, it } from "vitest";
import { cadenceLabel, defineCatalog } from "../catalog.js";
import { formatCompact, formatMicros, formatMoney, centsToMicros } from "../money.js";
import { blastCatalog, deckCatalog, IMAGE_METER } from "./fixtures.js";

describe("defineCatalog", () => {
  it("falls back to the free plan for an unknown or missing id", () => {
    // The under-granting direction: a row written by a future tier must not
    // hand out capabilities nobody can reason about.
    expect(deckCatalog.get("enterprise").id).toBe("free");
    expect(deckCatalog.get(null).id).toBe("free");
    expect(deckCatalog.get("enterprise").removesBranding).toBe(false);
  });

  it("orders cheapest first, so isUpgrade means what it says", () => {
    expect(deckCatalog.isUpgrade("free", "pro")).toBe(true);
    expect(deckCatalog.isUpgrade("team", "pro")).toBe(false);
    expect(deckCatalog.isUpgrade("pro", "pro")).toBe(false);
  });

  it("lists the paid plans Stripe needs prices for", () => {
    expect(deckCatalog.paid).toEqual(["pro", "team"]);
    expect(blastCatalog.paid).toEqual(["hobby", "pro", "agency"]);
  });

  it("refuses a catalog that would misprice or misroute", () => {
    expect(() =>
      defineCatalog({ plans: { free: { id: "free", name: "F", monthlyUnitAmountCents: 100, perSeat: false } }, order: ["free"], free: "free" }),
    ).toThrow(/must cost 0/);
    expect(() =>
      defineCatalog({ plans: { free: { id: "free", name: "F", monthlyUnitAmountCents: 9.5, perSeat: false } }, order: ["free"], free: "free" }),
    ).toThrow(/whole/);
    expect(() =>
      defineCatalog({
        plans: { free: { id: "free", name: "F", monthlyUnitAmountCents: 0, perSeat: false } },
        order: ["free", "pro"] as ("free" | "pro")[],
        free: "free",
      } as never),
    ).toThrow(/no plan/);
  });
});

describe("pricing math", () => {
  it("charges ten months for a year — the advertised two months free", () => {
    expect(deckCatalog.priceCents("pro", "yearly")).toBe(1600 * 10);
    expect(deckCatalog.yearlySavingsCents("pro")).toBe(1600 * 2);
    expect(deckCatalog.yearlySavingsCents("pro", 5)).toBe(1600 * 2 * 5);
    expect(blastCatalog.priceCents("agency", "yearly")).toBe(149_000);
  });

  it("keeps free free at any seat count", () => {
    expect(deckCatalog.totalCents("free", "monthly", 1)).toBe(0);
    expect(deckCatalog.totalCents("free", "yearly", 40)).toBe(0);
    expect(deckCatalog.yearlySavingsCents("free", 10)).toBe(0);
  });

  it("multiplies per-seat plans by seats, and only those", () => {
    expect(deckCatalog.totalCents("pro", "monthly", 4)).toBe(1600 * 4);
    expect(blastCatalog.totalCents("pro", "monthly", 4)).toBe(3900);
    expect(blastCatalog.yearlySavingsCents("pro", 4)).toBe(3900 * 2);
  });

  it("treats a zero or negative seat count as one seat", () => {
    expect(deckCatalog.totalCents("pro", "monthly", 0)).toBe(1600);
    expect(deckCatalog.totalCents("pro", "monthly", -3)).toBe(1600);
  });

  it("reads a plan's metered allowance, or null without one", () => {
    expect(blastCatalog.allowance("pro", IMAGE_METER)).toEqual({ amount: 10_000_000 });
    expect(blastCatalog.allowance("free", IMAGE_METER)?.resets).toBe(false);
    expect(deckCatalog.allowance("pro", IMAGE_METER)).toBeNull();
  });
});

describe("formatting", () => {
  it("drops decimals on whole dollars and keeps them otherwise", () => {
    expect(formatMoney(1600)).toBe("$16");
    expect(formatMoney(1650)).toBe("$16.50");
    expect(formatMoney(0)).toBe("$0");
    expect(formatMoney(1_234_500)).toBe("$12,345");
  });

  it("marks a credit with a real minus rather than losing the sign", () => {
    expect(formatMoney(-800)).toBe("−$8");
  });

  it("keeps micro-dollar precision where it's charged", () => {
    expect(formatMicros(39_000_000)).toBe("$39");
    expect(formatMicros(500_000)).toBe("$0.50");
    // toFixed(2) would print $0.08 — a 7% overstatement on a real price.
    expect(formatMicros(75_000)).toBe("$0.075");
    expect(formatMicros(3_168)).toBe("$0.00317");
    expect(formatMicros(-500_000)).toBe("−$0.50");
  });

  it("converts cents to micros exactly", () => {
    expect(centsToMicros(1000)).toBe(10_000_000);
  });

  it("abbreviates allowances", () => {
    expect(formatCompact(250_000)).toBe("250K");
    expect(formatCompact(5_000_000)).toBe("5M");
    expect(formatCompact(1_500_000)).toBe("1.5M");
    expect(formatCompact(900)).toBe("900");
  });

  it("says 'forever' for free and names the cadence otherwise", () => {
    expect(cadenceLabel(deckCatalog.plans.free, "monthly")).toBe("forever");
    expect(cadenceLabel(deckCatalog.plans.pro, "monthly")).toBe("per person, per month");
    expect(cadenceLabel(deckCatalog.plans.team, "yearly")).toBe("per person, per year");
    expect(cadenceLabel(blastCatalog.plans.pro, "monthly")).toBe("per month");
  });
});
