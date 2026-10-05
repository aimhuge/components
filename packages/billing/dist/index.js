/**
 * @aimhuge/billing — the client-safe half.
 *
 * Pure: no database, no provider SDK, no secrets, no clock of its own. Safe to
 * import from a client component (a plan picker's price preview, a meter).
 * Everything that talks to Supabase or Stripe is in `@aimhuge/billing/server`.
 */
export { BILLING_INTERVALS, cadenceLabel, defineCatalog, isBillingInterval, } from "./catalog.js";
export { CENT_MICROS, DOLLAR_MICROS, centsToMicros, formatCompact, formatMicros, formatMoney, } from "./money.js";
export { DAY_MS, addInterval, clampSeats, daysRemaining, periodFrom, previewChangeCents, prorateChange, renewalLines, rollForward, unusedFraction, } from "./period.js";
export { computeBalance, usageWindow } from "./usage.js";
export { BillingError, InsufficientCredit, isCustomerFacing } from "./errors.js";
export { COUNTRIES, countryName, isCountryCode } from "./countries.js";
export { INVOICE_STATUSES, SUBSCRIPTION_STATUSES, } from "./types.js";
