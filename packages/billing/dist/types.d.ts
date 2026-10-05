/**
 * The application's billing shapes — never a provider's. An adapter's job is
 * to produce these from whatever its API returns, which is what keeps billing
 * pages from ever importing a vendor SDK.
 *
 * Generic over the app's plan id (`P`) so `subscription.plan` stays a
 * `"free" | "pro" | "team"` in DeckCP rather than widening to `string`.
 */
import type { BillingInterval } from "./catalog.js";
export type SubscriptionStatus = "active" | "trialing" | "past_due" | "canceled" | "incomplete";
export declare const SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[];
export type InvoiceStatus = "draft" | "open" | "paid" | "void" | "uncollectible";
export declare const INVOICE_STATUSES: readonly InvoiceStatus[];
export type BillingProviderId = "mock" | "stripe";
export interface Subscription<P extends string = string> {
    orgId: string;
    plan: P;
    status: SubscriptionStatus;
    interval: BillingInterval;
    seats: number;
    /** Per-seat price frozen at purchase — may differ from today's catalog. */
    unitAmountCents: number;
    currency: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
    canceledAt: string | null;
    trialEnd: string | null;
    provider: BillingProviderId;
    providerCustomerId: string | null;
    providerSubscriptionId: string | null;
}
/**
 * One row on an invoice. `amountCents` is negative for credits. `quantity` ×
 * `unitAmountCents` will not always equal `amountCents` — a proration line
 * charges a fraction of the unit price — so render `amountCents` and treat the
 * other two as explanation.
 */
export interface InvoiceLine {
    description: string;
    quantity: number;
    unitAmountCents: number;
    amountCents: number;
    periodStart?: string;
    periodEnd?: string;
    /** True for mid-period adjustments, so the UI can label them. */
    proration?: boolean;
}
export interface Invoice {
    id: string;
    orgId: string;
    number: string;
    status: InvoiceStatus;
    currency: string;
    subtotalCents: number;
    taxCents: number;
    /** Negative on a credit note. */
    totalCents: number;
    amountPaidCents: number;
    periodStart: string | null;
    periodEnd: string | null;
    issuedAt: string;
    paidAt: string | null;
    dueAt: string | null;
    description: string | null;
    lines: InvoiceLine[];
    hostedUrl: string | null;
    pdfUrl: string | null;
}
export interface PaymentMethod {
    id: string;
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
    holderName: string | null;
    isDefault: boolean;
    createdAt: string;
}
export interface BillingProfile {
    billingEmail: string | null;
    companyName: string | null;
    taxId: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    region: string | null;
    postalCode: string | null;
    country: string | null;
}
/**
 * One metered dimension, shaped for a bar. `limit === null` is unmetered — the
 * UI shows the figure without a bar rather than a bar that can never fill.
 * Apps build these; the package defines the shape so a shared meter component
 * can render any app's.
 */
export interface UsageMeter<K extends string = string> {
    key: K;
    label: string;
    used: number;
    limit: number | null;
    /** How to render `used` / `limit`. */
    format: "count" | "compact" | "micros";
    /** Copy shown under the bar when `used` is at or over `limit`. */
    overageHint: string;
}
/** Everything about an org's billing that is the same in every app. Apps add
 *  their own usage meters on top. */
export interface BillingAccount<P extends string = string> {
    subscription: Subscription<P>;
    invoices: Invoice[];
    paymentMethods: PaymentMethod[];
    profile: BillingProfile;
    /** Member count, for a seat meter and the "more members than seats" notice. */
    memberCount: number;
    /** Owner's account email — the fallback invoice recipient. */
    ownerEmail: string | null;
    /** Which provider is live, so the UI can label test billing honestly. */
    provider: BillingProviderId;
}
