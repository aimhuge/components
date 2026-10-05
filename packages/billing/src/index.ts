/**
 * @aimhuge/billing — the client-safe half.
 *
 * Pure: no database, no provider SDK, no secrets, no clock of its own. Safe to
 * import from a client component (a plan picker's price preview, a meter).
 * Everything that talks to Supabase or Stripe is in `@aimhuge/billing/server`.
 */
export {
  BILLING_INTERVALS,
  cadenceLabel,
  defineCatalog,
  isBillingInterval,
  type Allowance,
  type BasePlan,
  type BillingInterval,
  type Catalog,
  type CatalogSpec,
} from "./catalog.js";
export {
  CENT_MICROS,
  DOLLAR_MICROS,
  centsToMicros,
  formatCompact,
  formatMicros,
  formatMoney,
} from "./money.js";
export {
  DAY_MS,
  addInterval,
  clampSeats,
  daysRemaining,
  periodFrom,
  previewChangeCents,
  prorateChange,
  renewalLines,
  rollForward,
  unusedFraction,
  type Period,
  type PlanTerms,
  type ProrationInput,
  type ProrationResult,
} from "./period.js";
export { computeBalance, usageWindow, type MeterBalance } from "./usage.js";
export { BillingError, InsufficientCredit, isCustomerFacing } from "./errors.js";
export { COUNTRIES, countryName, isCountryCode, type Country } from "./countries.js";
export {
  INVOICE_STATUSES,
  SUBSCRIPTION_STATUSES,
  type BillingAccount,
  type BillingProfile,
  type BillingProviderId,
  type Invoice,
  type InvoiceLine,
  type InvoiceStatus,
  type PaymentMethod,
  type Subscription,
  type SubscriptionStatus,
  type UsageMeter,
} from "./types.js";
