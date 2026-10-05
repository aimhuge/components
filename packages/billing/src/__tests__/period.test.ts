import { describe, it, expect } from "vitest";
import { deckCatalog as catalog } from "./fixtures.js";
import {
  addInterval,
  daysRemaining,
  periodFrom,
  previewChangeCents,
  prorateChange,
  renewalLines,
  rollForward,
  unusedFraction,
} from "../period.js";

const PLANS = catalog.plans;
const priceCents = catalog.priceCents;
const totalCents = catalog.totalCents;

const iso = (s: string) => new Date(s);

describe("addInterval", () => {
  it("keeps the day of month across a normal month boundary", () => {
    expect(addInterval(iso("2026-03-15T00:00:00Z"), "monthly").toISOString()).toBe(
      "2026-04-15T00:00:00.000Z",
    );
  });

  it("clamps to the last day of a short month instead of spilling into the next", () => {
    // The setMonth trap: Jan 31 + 1 month naively becomes Mar 3.
    expect(addInterval(iso("2026-01-31T00:00:00Z"), "monthly").toISOString()).toBe(
      "2026-02-28T00:00:00.000Z",
    );
  });

  it("lands on Feb 29 in a leap year", () => {
    expect(addInterval(iso("2028-01-31T00:00:00Z"), "monthly").toISOString()).toBe(
      "2028-02-29T00:00:00.000Z",
    );
  });

  it("advances a year for the yearly interval, leap day included", () => {
    expect(addInterval(iso("2026-06-01T00:00:00Z"), "yearly").toISOString()).toBe(
      "2027-06-01T00:00:00.000Z",
    );
    expect(addInterval(iso("2028-02-29T00:00:00Z"), "yearly").toISOString()).toBe(
      "2029-02-28T00:00:00.000Z",
    );
  });
});

describe("unusedFraction", () => {
  const period = { start: "2026-08-01T00:00:00Z", end: "2026-08-31T00:00:00Z" };

  it("is 1 at the start and 0 at the end", () => {
    expect(unusedFraction(iso("2026-08-01T00:00:00Z"), period)).toBe(1);
    expect(unusedFraction(iso("2026-08-31T00:00:00Z"), period)).toBe(0);
  });

  it("is half way through the middle", () => {
    expect(unusedFraction(iso("2026-08-16T00:00:00Z"), period)).toBeCloseTo(0.5, 5);
  });

  it("clamps rather than crediting time nobody bought", () => {
    // A clock skewed before the period start would otherwise exceed 1.
    expect(unusedFraction(iso("2026-07-01T00:00:00Z"), period)).toBe(1);
    // And a lapsed period would otherwise go negative and invent a charge.
    expect(unusedFraction(iso("2026-10-01T00:00:00Z"), period)).toBe(0);
  });

  it("returns 0 for a zero-length or inverted period rather than dividing by zero", () => {
    expect(unusedFraction(iso("2026-08-10T00:00:00Z"), { start: period.end, end: period.end })).toBe(0);
    expect(unusedFraction(iso("2026-08-10T00:00:00Z"), { start: period.end, end: period.start })).toBe(0);
  });
});

describe("daysRemaining", () => {
  const period = { start: "2026-08-01T00:00:00Z", end: "2026-08-31T00:00:00Z" };

  it("rounds up, so a partial day still reads as a day left", () => {
    expect(daysRemaining(iso("2026-08-30T01:00:00Z"), period)).toBe(1);
    expect(daysRemaining(iso("2026-08-21T00:00:00Z"), period)).toBe(10);
  });

  it("floors at zero once the period has passed", () => {
    expect(daysRemaining(iso("2026-09-05T00:00:00Z"), period)).toBe(0);
  });
});

describe("prorateChange", () => {
  const period = { start: "2026-08-01T00:00:00Z", end: "2026-08-31T00:00:00Z" };
  const halfway = iso("2026-08-16T00:00:00Z");

  it("credits the old plan and charges the new one for the same remainder", () => {
    const result = prorateChange(catalog, {
      now: halfway,
      period,
      from: { plan: "pro", interval: "monthly", seats: 1, unitAmountCents: PLANS.pro.monthlyUnitAmountCents },
      to: { plan: "team", interval: "monthly", seats: 1 },
    });

    const [credit, charge] = result.lines;
    expect(credit!.amountCents).toBe(-Math.round(PLANS.pro.monthlyUnitAmountCents * 0.5));
    expect(charge!.amountCents).toBe(Math.round(PLANS.team.monthlyUnitAmountCents * 0.5));
    // Net is the price DIFFERENCE for the remaining half-month, not a full month.
    expect(result.totalCents).toBe(credit!.amountCents + charge!.amountCents);
    expect(result.totalCents).toBeLessThan(PLANS.team.monthlyUnitAmountCents);
    // The period end does not move on a same-interval change.
    expect(result.period.end).toBe(period.end);
  });

  it("nets to a credit when downgrading mid-period", () => {
    const result = prorateChange(catalog, {
      now: halfway,
      period,
      from: { plan: "team", interval: "monthly", seats: 2, unitAmountCents: PLANS.team.monthlyUnitAmountCents },
      to: { plan: "free", interval: "monthly", seats: 1 },
    });
    expect(result.totalCents).toBeLessThan(0);
    // Free charges nothing, so the credit line is the whole invoice.
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]!.proration).toBe(true);
  });

  it("credits at the price actually paid, not today's catalog price", () => {
    // A customer grandfathered at $10 must be credited $5 for half a month,
    // never the $8 today's $16 sticker would imply.
    const grandfathered = 1000;
    const result = prorateChange(catalog, {
      now: halfway,
      period,
      from: { plan: "pro", interval: "monthly", seats: 1, unitAmountCents: grandfathered },
      to: { plan: "free", interval: "monthly", seats: 1 },
    });
    expect(result.lines[0]!.amountCents).toBe(-Math.round(grandfathered * 0.5));
  });

  it("starts a fresh full-price period when the interval changes", () => {
    const result = prorateChange(catalog, {
      now: halfway,
      period,
      from: { plan: "pro", interval: "monthly", seats: 1, unitAmountCents: PLANS.pro.monthlyUnitAmountCents },
      to: { plan: "pro", interval: "yearly", seats: 1 },
    });

    const charge = result.lines.find((line) => line.amountCents > 0);
    expect(charge?.amountCents).toBe(priceCents("pro", "yearly"));
    // The monthly period can't be stretched into a yearly one — a new one opens.
    expect(result.period.start).toBe(halfway.toISOString());
    expect(result.period.end).not.toBe(period.end);
  });

  it("scales the credit and the charge by seats independently", () => {
    const result = prorateChange(catalog, {
      now: halfway,
      period,
      from: { plan: "pro", interval: "monthly", seats: 2, unitAmountCents: PLANS.pro.monthlyUnitAmountCents },
      to: { plan: "pro", interval: "monthly", seats: 5 },
    });
    const [credit, charge] = result.lines;
    expect(credit!.amountCents).toBe(-Math.round(PLANS.pro.monthlyUnitAmountCents * 2 * 0.5));
    expect(charge!.amountCents).toBe(Math.round(PLANS.pro.monthlyUnitAmountCents * 5 * 0.5));
    expect(result.totalCents).toBeGreaterThan(0);
  });

  it("charges the full price when the change lands on the period start", () => {
    const result = prorateChange(catalog, {
      now: iso(period.start),
      period,
      from: { plan: "free", interval: "monthly", seats: 1, unitAmountCents: 0 },
      to: { plan: "pro", interval: "monthly", seats: 1 },
    });
    expect(result.totalCents).toBe(PLANS.pro.monthlyUnitAmountCents);
  });

  it("charges nothing when the period has already lapsed", () => {
    const result = prorateChange(catalog, {
      now: iso("2026-09-15T00:00:00Z"),
      period,
      from: { plan: "pro", interval: "monthly", seats: 1, unitAmountCents: PLANS.pro.monthlyUnitAmountCents },
      to: { plan: "team", interval: "monthly", seats: 1 },
    });
    expect(result.lines).toHaveLength(0);
    expect(result.totalCents).toBe(0);
  });
});

describe("renewalLines", () => {
  it("bills one full period at the catalog price", () => {
    const period = periodFrom(iso("2026-08-01T00:00:00Z"), "monthly");
    const lines = renewalLines(catalog, "pro", "monthly", 3, period);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.amountCents).toBe(totalCents("pro", "monthly", 3));
    expect(lines[0]!.proration).toBeUndefined();
  });

  it("issues nothing for free — an invoice for $0 is noise", () => {
    const period = periodFrom(iso("2026-08-01T00:00:00Z"), "monthly");
    expect(renewalLines(catalog, "free", "monthly", 1, period)).toHaveLength(0);
  });
});

describe("rollForward", () => {
  it("leaves a period that hasn't lapsed alone", () => {
    const period = { start: "2026-08-01T00:00:00.000Z", end: "2026-09-01T00:00:00.000Z" };
    expect(rollForward(period, "monthly", iso("2026-08-20T00:00:00Z"))).toBe(period);
  });

  it("rolls a lapsed free period to the one containing now, by whole intervals", () => {
    const period = { start: "2026-05-15T00:00:00.000Z", end: "2026-06-15T00:00:00.000Z" };
    expect(rollForward(period, "monthly", iso("2026-10-05T09:00:00Z"))).toEqual({
      start: "2026-09-15T00:00:00.000Z",
      end: "2026-10-15T00:00:00.000Z",
    });
  });

  it("anchors on the original day, so a 31st survives February", () => {
    // Step-by-step addInterval would clamp to Feb 28 and then stay on the 28th.
    const period = { start: "2026-01-31T00:00:00.000Z", end: "2026-02-28T00:00:00.000Z" };
    expect(rollForward(period, "monthly", iso("2026-03-30T00:00:00Z"))).toEqual({
      start: "2026-02-28T00:00:00.000Z",
      end: "2026-03-31T00:00:00.000Z",
    });
    expect(rollForward(period, "monthly", iso("2026-04-10T00:00:00Z"))).toEqual({
      start: "2026-03-31T00:00:00.000Z",
      end: "2026-04-30T00:00:00.000Z",
    });
  });

  it("treats a period ending exactly now as lapsed", () => {
    const period = { start: "2026-08-01T00:00:00.000Z", end: "2026-09-01T00:00:00.000Z" };
    expect(rollForward(period, "monthly", iso("2026-09-01T00:00:00Z")).start).toBe("2026-09-01T00:00:00.000Z");
  });
});

describe("previewChangeCents", () => {
  const current = {
    plan: "free" as const,
    interval: "monthly" as const,
    seats: 1,
    unitAmountCents: 0,
    currentPeriodStart: "2026-08-01T00:00:00Z",
    currentPeriodEnd: "2026-08-31T00:00:00Z",
  };

  it("quotes a first purchase at full price", () => {
    const quote = previewChangeCents(catalog, current, { plan: "pro", interval: "monthly", seats: 3 }, iso("2026-08-16T00:00:00Z"));
    expect(quote).toBe(1600 * 3);
  });

  it("quotes a paid change as the prorated difference", () => {
    const quote = previewChangeCents(
      catalog,
      { ...current, plan: "pro", unitAmountCents: 1600 },
      { plan: "team", interval: "monthly", seats: 1 },
      iso("2026-08-16T00:00:00Z"),
    );
    expect(quote).toBe(Math.round(2400 * 0.5) - Math.round(1600 * 0.5));
  });
});
