import { describe, expect, it } from "vitest";
import { computeBalance, usageWindow } from "../usage.js";
import { blastCatalog, IMAGE_METER } from "./fixtures.js";

const period = { start: "2026-10-01T00:00:00.000Z", end: "2026-11-01T00:00:00.000Z" };
const now = new Date("2026-10-15T00:00:00Z");

describe("usageWindow", () => {
  it("is the subscription period for an allowance that resets", () => {
    expect(usageWindow(blastCatalog.allowance("pro", IMAGE_METER), period)).toEqual(period);
  });

  it("is all time for a lifetime allowance — Free's credit is spent once", () => {
    expect(usageWindow(blastCatalog.allowance("free", IMAGE_METER), period)).toEqual({ start: null, end: null });
  });
});

describe("computeBalance", () => {
  it("is allowance + unexpired grants − spend", () => {
    const balance = computeBalance({
      meter: IMAGE_METER,
      allowance: blastCatalog.allowance("pro", IMAGE_METER),
      period,
      grants: [
        { amount: 2_000_000, expiresAt: null },
        { amount: 5_000_000, expiresAt: "2026-10-31T00:00:00Z" },
        // Expired: counts for nothing.
        { amount: 9_000_000, expiresAt: "2026-10-01T00:00:00Z" },
      ],
      spent: 1_234_567,
      now,
    });
    expect(balance.allowance).toBe(10_000_000);
    expect(balance.granted).toBe(7_000_000);
    expect(balance.remaining).toBe(10_000_000 + 7_000_000 - 1_234_567);
    expect(balance.resets).toBe(true);
  });

  it("floors remaining at zero when a race overdrew it", () => {
    const balance = computeBalance({
      meter: IMAGE_METER,
      allowance: { amount: 500_000, resets: false },
      period,
      grants: [],
      spent: 731_000,
      now,
    });
    expect(balance.remaining).toBe(0);
    expect(balance.window.start).toBeNull();
  });

  it("gives nothing on a meter the plan has no allowance for", () => {
    const balance = computeBalance({ meter: "renders", allowance: null, period, grants: [], spent: 0, now });
    expect(balance.allowance).toBe(0);
    expect(balance.remaining).toBe(0);
  });
});
