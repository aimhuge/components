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
export declare const TEST_CARDS: readonly TestCard[];
export declare const BRAND_LABEL: Record<CardBrand, string>;
export interface CardInput {
    number: string;
    expMonth: number;
    expYear: number;
    cvc: string;
    holderName: string;
}
export type TokenizeResult = {
    ok: true;
    token: string;
} | {
    ok: false;
    field: "number" | "expiry" | "cvc" | "name";
    message: string;
};
/**
 * Card token: `pmt_<brand>_<last4>_<expMonth>_<expYear>_<outcome>`.
 *
 * Opaque to every caller by contract — only the mock provider parses it — but
 * deliberately readable, because a token you can read is a token you can debug
 * from a log line. It carries no secret: brand and last four appear on any
 * receipt, and there is nothing in it that could reconstruct a card.
 */
export declare function tokenizeCard(input: CardInput): TokenizeResult;
export interface ParsedToken {
    brand: CardBrand;
    last4: string;
    expMonth: number;
    expYear: number;
    outcome: TestCardOutcome;
}
/** Read a token back on the server. Returns null for anything malformed. */
export declare function parseCardToken(token: string): ParsedToken | null;
/** A card is good through the LAST day of its expiry month, not the first. */
export declare function isExpired(expMonth: number, expYear: number, now: Date): boolean;
/** Standard mod-10 checksum. Catches transposed digits before anything else. */
export declare function luhnValid(digits: string): boolean;
/** "4242 4242 4242 4242" / "3782 822463 10005" — grouping as printed on the card. */
export declare function formatCardNumber(value: string): string;
export {};
