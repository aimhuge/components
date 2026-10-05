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
export const DOLLAR_MICROS = 1_000_000;
export const CENT_MICROS = 10_000;
export function centsToMicros(cents) {
    return Math.round(cents) * CENT_MICROS;
}
/** Cents → "$16" / "$16.50" / "−$8". Whole amounts drop the decimals — "$16.00"
 *  reads like a form field. A credit keeps its sign as a real minus. */
export function formatMoney(cents, currency = "usd") {
    const negative = cents < 0;
    const abs = Math.abs(cents);
    const symbol = currency.toLowerCase() === "usd" ? "$" : "";
    const body = abs % 100 === 0
        ? `${symbol}${(abs / 100).toLocaleString("en-US")}`
        : `${symbol}${(abs / 100).toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })}`;
    const withCurrency = symbol ? body : `${body} ${currency.toUpperCase()}`;
    return negative ? `−${withCurrency}` : withCurrency;
}
/**
 * Micros → `$39` / `$0.50` / `$0.075` / `$0.00317`.
 *
 * Precision is deliberately NOT a flat two decimals. Usage is exact to the
 * micro-dollar, and two decimals misstate it: $0.075 prints as $0.08 under
 * `toFixed(2)`, a 7% overstatement on a price actually charged. Below a cent,
 * five decimals; from a cent to a dollar, two or three; above, two.
 */
export function formatMicros(micros) {
    const dollars = micros / DOLLAR_MICROS;
    const sign = dollars < 0 ? "−" : "";
    const abs = Math.abs(dollars);
    if (Number.isInteger(abs))
        return `${sign}$${abs.toLocaleString("en-US")}`;
    const [min, max] = abs < 0.01 ? [5, 5] : abs < 1 ? [2, 3] : [2, 2];
    return `${sign}$${abs.toLocaleString("en-US", {
        minimumFractionDigits: min,
        maximumFractionDigits: max,
    })}`;
}
/** "5M" / "250K" — allowance figures where exact digits are noise. */
export function formatCompact(n) {
    if (n >= 1_000_000) {
        const m = n / 1_000_000;
        return `${m % 1 === 0 ? m : m.toFixed(1)}M`;
    }
    if (n >= 1_000) {
        const k = n / 1_000;
        return `${k % 1 === 0 ? k : k.toFixed(1)}K`;
    }
    return String(n);
}
