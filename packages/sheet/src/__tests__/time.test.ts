// The sheet kit's date buckets (lib/sheet.ts timeBucket): how long ago a time was, as a date column's filter names it.
import { describe, expect, it } from "vitest";
import { timeBucket, TIME_ORDER, BLANK } from "../sheet.js";

const NOW = 1_800_000_000_000;

describe("timeBucket", () => {
  const DAY = 86_400_000;

  it("blanks a missing or unreadable time", () => {
    expect(timeBucket(null, NOW)).toBe(BLANK);
    expect(timeBucket(Number.NaN, NOW)).toBe(BLANK);
  });

  it("puts a time exactly on a bucket's edge in the next bucket", () => {
    expect(timeBucket(NOW, NOW)).toBe("Today");
    expect(timeBucket(NOW - DAY, NOW)).toBe("This week");
    expect(timeBucket(NOW - 7 * DAY, NOW)).toBe("This month");
    expect(timeBucket(NOW - 31 * DAY, NOW)).toBe("This year");
    expect(timeBucket(NOW - 365 * DAY, NOW)).toBe("Older");
  });

  it("keeps a time just inside a bucket in it, and counts a future time as today", () => {
    expect(timeBucket(NOW - DAY + 1, NOW)).toBe("Today");
    expect(timeBucket(NOW - 7 * DAY + 1, NOW)).toBe("This week");
    expect(timeBucket(NOW - 31 * DAY + 1, NOW)).toBe("This month");
    expect(timeBucket(NOW - 365 * DAY + 1, NOW)).toBe("This year");
    expect(timeBucket(NOW + DAY, NOW)).toBe("Today");
  });

  it("orders its buckets youngest first", () => {
    expect(TIME_ORDER).toEqual(["Today", "This week", "This month", "This year", "Older"]);
  });
});
