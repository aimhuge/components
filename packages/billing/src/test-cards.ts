/**
 * Test-card tokenization for the mock provider.
 *
 * This module runs IN THE BROWSER. That placement is the whole point: it mirrors
 * how a real payment provider works, where a card is exchanged for a token by
 * the provider's own client-side SDK and the number never touches a server we
 * operate. `tokenizeCard` returns a token carrying only what a receipt needs —
 * brand, last four, expiry — and the entered digits are discarded with the
 * component state. Nothing in this file, and nothing downstream of it, can send
 * a full card number anywhere.
 *
 * Only published test numbers are accepted. A real card entered here would be
 * rejected before tokenization, which is deliberate belt-and-braces: the mock
 * moves no money, so a real number reaching it could only ever be a mistake, and
 * a mistake that silently "worked" would be worse than one that fails loudly.
 */

export type CardBrand = "visa" | "mastercard" | "amex" | "discover";

/** How the mock behaves when the card is charged. */
export type TestCardOutcome = "succeeds" | "declined" | "insufficient_funds";

interface TestCard {
  number: string;
  brand: CardBrand;
  outcome: TestCardOutcome;
  /** Shown in the checkout form's cheat sheet. */
  note: string;
}

/**
 * The published test numbers, matching the ones the industry uses, so muscle
 * memory transfers when a real provider replaces the mock. The declining cards
 * exist so the failure paths (dunning copy, `past_due`, the retry affordance)
 * can actually be exercised — a payment system whose failure branch has never
 * run is a payment system with an untested failure branch.
 */
export const TEST_CARDS: readonly TestCard[] = [
  { number: "4242424242424242", brand: "visa", outcome: "succeeds", note: "Visa — always succeeds" },
  { number: "5555555555554444", brand: "mastercard", outcome: "succeeds", note: "Mastercard — always succeeds" },
  { number: "378282246310005", brand: "amex", outcome: "succeeds", note: "American Express — always succeeds" },
  { number: "6011111111111117", brand: "discover", outcome: "succeeds", note: "Discover — always succeeds" },
  { number: "4000000000000002", brand: "visa", outcome: "declined", note: "Visa — card declined" },
  { number: "4000000000009995", brand: "visa", outcome: "insufficient_funds", note: "Visa — insufficient funds" },
] as const;

export const BRAND_LABEL: Record<CardBrand, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  discover: "Discover",
};

export interface CardInput {
  number: string;
  expMonth: number;
  expYear: number;
  cvc: string;
  holderName: string;
}

export type TokenizeResult =
  | { ok: true; token: string }
  | { ok: false; field: "number" | "expiry" | "cvc" | "name"; message: string };

/**
 * Card token: `pmt_<brand>_<last4>_<expMonth>_<expYear>_<outcome>`.
 *
 * Opaque to every caller by contract — only the mock provider parses it — but
 * deliberately readable, because a token you can read is a token you can debug
 * from a log line. It carries no secret: brand and last four appear on any
 * receipt, and there is nothing in it that could reconstruct a card.
 */
export function tokenizeCard(input: CardInput): TokenizeResult {
  const digits = input.number.replace(/[\s-]/g, "");

  if (!/^\d{12,19}$/.test(digits)) {
    return { ok: false, field: "number", message: "Enter a card number." };
  }
  if (!luhnValid(digits)) {
    return { ok: false, field: "number", message: "That card number isn't valid." };
  }

  const card = TEST_CARDS.find((c) => c.number === digits);
  if (!card) {
    return {
      ok: false,
      field: "number",
      message:
        "This workspace is on test billing — only the test cards listed below are accepted. Don't enter a real card.",
    };
  }

  if (!Number.isInteger(input.expMonth) || input.expMonth < 1 || input.expMonth > 12) {
    return { ok: false, field: "expiry", message: "Enter a month between 1 and 12." };
  }
  if (!Number.isInteger(input.expYear) || input.expYear < 2000 || input.expYear > 2100) {
    return { ok: false, field: "expiry", message: "Enter a four-digit year." };
  }
  if (isExpired(input.expMonth, input.expYear, new Date())) {
    return { ok: false, field: "expiry", message: "That card has expired." };
  }

  // Amex CVCs are four digits, everyone else's are three.
  const cvcLength = card.brand === "amex" ? 4 : 3;
  if (!new RegExp(`^\\d{${cvcLength}}$`).test(input.cvc.trim())) {
    return { ok: false, field: "cvc", message: `Enter the ${cvcLength}-digit security code.` };
  }
  if (!input.holderName.trim()) {
    return { ok: false, field: "name", message: "Enter the name on the card." };
  }

  const last4 = digits.slice(-4);
  return {
    ok: true,
    token: `pmt_${card.brand}_${last4}_${input.expMonth}_${input.expYear}_${card.outcome}`,
  };
}

export interface ParsedToken {
  brand: CardBrand;
  last4: string;
  expMonth: number;
  expYear: number;
  outcome: TestCardOutcome;
}

/** Read a token back on the server. Returns null for anything malformed. */
export function parseCardToken(token: string): ParsedToken | null {
  const match = /^pmt_(visa|mastercard|amex|discover)_(\d{4})_(\d{1,2})_(\d{4})_(succeeds|declined|insufficient_funds)$/.exec(
    token,
  );
  if (!match) return null;
  return {
    brand: match[1] as CardBrand,
    last4: match[2] ?? "",
    expMonth: Number(match[3]),
    expYear: Number(match[4]),
    outcome: match[5] as TestCardOutcome,
  };
}

/** A card is good through the LAST day of its expiry month, not the first. */
export function isExpired(expMonth: number, expYear: number, now: Date): boolean {
  const nowYear = now.getUTCFullYear();
  const nowMonth = now.getUTCMonth() + 1;
  return expYear < nowYear || (expYear === nowYear && expMonth < nowMonth);
}

/** Standard mod-10 checksum. Catches transposed digits before anything else. */
export function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = digits.charCodeAt(i) - 48;
    if (digit < 0 || digit > 9) return false;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

/** "4242 4242 4242 4242" / "3782 822463 10005" — grouping as printed on the card. */
export function formatCardNumber(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 19);
  const isAmex = /^3[47]/.test(digits);
  const groups = isAmex ? [4, 6, 5] : [4, 4, 4, 4, 3];
  const parts: string[] = [];
  let index = 0;
  for (const size of groups) {
    if (index >= digits.length) break;
    parts.push(digits.slice(index, index + size));
    index += size;
  }
  return parts.join(" ");
}
