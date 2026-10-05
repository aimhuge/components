/**
 * Money. Two units, each where it belongs, and never a float.
 *
 *   CENTS   — everything a payment provider charges: plan prices, invoices,
 *             proration lines. Stripe speaks minor units, so the mirror does
 *             too and an amount passes through without conversion.
 *
 *   MICROS  — metered usage (1e-6 USD). A cheap generated image retails at
 *             $0.00317; rounded to cents, three of BlastCP's four image models
 *             would be free. The usage ledger and its allowances are micros.
 *
 * Column and field names carry the unit (`_cents`, `Micros`), and the one
 * place they meet is `centsToMicros` — buying a $10 credit bundle grants
 * 10,000,000 micros. There is no micros→cents helper on purpose: anything
 * metered that needs charging goes through Stripe as its own priced item.
 */
export declare const DOLLAR_MICROS = 1000000;
export declare const CENT_MICROS = 10000;
export declare function centsToMicros(cents: number): number;
/** Cents → "$16" / "$16.50" / "−$8". Whole amounts drop the decimals — "$16.00"
 *  reads like a form field. A credit keeps its sign as a real minus. */
export declare function formatMoney(cents: number, currency?: string): string;
/**
 * Micros → `$39` / `$0.50` / `$0.075` / `$0.00317`.
 *
 * Precision is deliberately NOT a flat two decimals. Usage is exact to the
 * micro-dollar, and two decimals misstate it: $0.075 prints as $0.08 under
 * `toFixed(2)`, a 7% overstatement on a price actually charged. Below a cent,
 * five decimals; from a cent to a dollar, two or three; above, two.
 */
export declare function formatMicros(micros: number): string;
/** "5M" / "250K" — allowance figures where exact digits are noise. */
export declare function formatCompact(n: number): string;
