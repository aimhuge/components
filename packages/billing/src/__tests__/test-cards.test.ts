import { describe, it, expect } from "vitest";
import {
  TEST_CARDS,
  formatCardNumber,
  isExpired,
  luhnValid,
  parseCardToken,
  tokenizeCard,
} from "../test-cards.js";

const valid = {
  number: "4242 4242 4242 4242",
  expMonth: 12,
  expYear: new Date().getUTCFullYear() + 2,
  cvc: "123",
  holderName: "Alex Morgan",
};

describe("luhnValid", () => {
  it("accepts every published test number", () => {
    for (const card of TEST_CARDS) {
      expect(luhnValid(card.number), card.number).toBe(true);
    }
  });

  it("rejects a transposed digit", () => {
    expect(luhnValid("4242424242424243")).toBe(false);
  });

  it("rejects non-digits rather than coercing them", () => {
    expect(luhnValid("4242-4242")).toBe(false);
  });
});

describe("tokenizeCard", () => {
  it("mints a token carrying only brand, last four, expiry and outcome", () => {
    const result = tokenizeCard(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The whole security property: nothing in the token can rebuild the card.
    expect(result.token).not.toContain("4242424242424242");
    expect(result.token).toContain("4242");
    expect(result.token).not.toContain(valid.cvc + "_");

    const parsed = parseCardToken(result.token);
    expect(parsed).toEqual({
      brand: "visa",
      last4: "4242",
      expMonth: 12,
      expYear: valid.expYear,
      outcome: "succeeds",
    });
  });

  it("refuses a card that isn't a published test number", () => {
    // Luhn-valid but not on the list — the belt-and-braces guard that stops a
    // real card from ever being tokenized by the mock.
    const result = tokenizeCard({ ...valid, number: "4111111111111111" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.field).toBe("number");
    expect(result.message).toContain("test");
  });

  it("carries the decline outcome so failure paths can be exercised", () => {
    const declined = tokenizeCard({ ...valid, number: "4000000000000002" });
    expect(declined.ok).toBe(true);
    if (!declined.ok) return;
    expect(parseCardToken(declined.token)?.outcome).toBe("declined");

    const broke = tokenizeCard({ ...valid, number: "4000000000009995" });
    expect(broke.ok).toBe(true);
    if (!broke.ok) return;
    expect(parseCardToken(broke.token)?.outcome).toBe("insufficient_funds");
  });

  it("wants four CVC digits for Amex and three for everyone else", () => {
    const amexShort = tokenizeCard({ ...valid, number: "378282246310005", cvc: "123" });
    expect(amexShort.ok).toBe(false);
    const amexOk = tokenizeCard({ ...valid, number: "378282246310005", cvc: "1234" });
    expect(amexOk.ok).toBe(true);
    const visaLong = tokenizeCard({ ...valid, cvc: "1234" });
    expect(visaLong.ok).toBe(false);
  });

  it("rejects an expired card, a bad month, and a missing name", () => {
    expect(tokenizeCard({ ...valid, expYear: 2020 }).ok).toBe(false);
    expect(tokenizeCard({ ...valid, expMonth: 13 }).ok).toBe(false);
    expect(tokenizeCard({ ...valid, holderName: "  " }).ok).toBe(false);
  });

  it("points at the field that's wrong, so the form can highlight it", () => {
    const result = tokenizeCard({ ...valid, expMonth: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.field).toBe("expiry");
  });
});

describe("parseCardToken", () => {
  it("returns null for anything malformed, including a bare card number", () => {
    expect(parseCardToken("4242424242424242")).toBeNull();
    expect(parseCardToken("pmt_visa_4242")).toBeNull();
    expect(parseCardToken("pmt_amex_4242_12_2030_maybe")).toBeNull();
    expect(parseCardToken("")).toBeNull();
  });
});

describe("isExpired", () => {
  it("keeps a card valid through the last day of its expiry month", () => {
    const now = new Date("2026-08-13T00:00:00Z");
    expect(isExpired(8, 2026, now)).toBe(false);
    expect(isExpired(7, 2026, now)).toBe(true);
    expect(isExpired(1, 2027, now)).toBe(false);
    expect(isExpired(12, 2025, now)).toBe(true);
  });
});

describe("formatCardNumber", () => {
  it("groups in fours, and in Amex's 4-6-5", () => {
    expect(formatCardNumber("4242424242424242")).toBe("4242 4242 4242 4242");
    expect(formatCardNumber("378282246310005")).toBe("3782 822463 10005");
  });

  it("strips non-digits and caps the length", () => {
    expect(formatCardNumber("4242-abc-4242")).toBe("4242 4242");
    expect(formatCardNumber("4".repeat(30)).replace(/ /g, "")).toHaveLength(19);
  });
});
