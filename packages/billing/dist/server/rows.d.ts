/**
 * DB row shapes and their mappers to the domain types. Pure — no database.
 *
 * Defensive about enum-ish columns: a row written by a future provider (or a
 * hand-edited one) narrows to a safe value rather than widening the domain
 * type. A plan the catalog doesn't know reads as free — the direction that
 * under-grants rather than over-grants.
 */
import { type Catalog } from "../catalog.js";
import { type BillingProfile, type BillingProviderId, type Invoice, type InvoiceLine, type PaymentMethod, type Subscription } from "../types.js";
export interface SubscriptionRow {
    org_id: string;
    plan: string;
    status: string;
    billing_interval: string;
    seats: number;
    unit_amount_cents: number;
    currency: string;
    current_period_start: string;
    current_period_end: string;
    cancel_at_period_end: boolean;
    canceled_at: string | null;
    trial_end: string | null;
    provider: string;
    provider_customer_id: string | null;
    provider_subscription_id: string | null;
}
export interface InvoiceRow {
    id: string;
    org_id: string;
    number: string;
    status: string;
    currency: string;
    subtotal_cents: number;
    tax_cents: number;
    total_cents: number;
    amount_paid_cents: number;
    period_start: string | null;
    period_end: string | null;
    issued_at: string;
    paid_at: string | null;
    due_at: string | null;
    description: string | null;
    lines: unknown;
    hosted_url: string | null;
    pdf_url: string | null;
}
export interface PaymentMethodRow {
    id: string;
    brand: string;
    last4: string;
    exp_month: number;
    exp_year: number;
    holder_name: string | null;
    is_default: boolean;
    created_at: string;
}
export interface BillingProfileRow {
    billing_email: string | null;
    company_name: string | null;
    tax_id: string | null;
    address_line1: string | null;
    address_line2: string | null;
    city: string | null;
    region: string | null;
    postal_code: string | null;
    country: string | null;
}
export declare function asProvider(value: string): BillingProviderId;
export declare function toSubscription<P extends string>(catalog: Catalog<P>, row: SubscriptionRow): Subscription<P>;
/** `lines` is jsonb, so it is validated rather than cast: a malformed row
 *  renders no lines instead of taking the billing page down. */
export declare function toInvoiceLines(value: unknown): InvoiceLine[];
export declare function toInvoice(row: InvoiceRow): Invoice;
export declare function toPaymentMethod(row: PaymentMethodRow): PaymentMethod;
export declare function toBillingProfile(row: BillingProfileRow | null): BillingProfile;
export declare const SUBSCRIPTION_COLUMNS = "org_id, plan, status, billing_interval, seats, unit_amount_cents, currency, current_period_start, current_period_end, cancel_at_period_end, canceled_at, trial_end, provider, provider_customer_id, provider_subscription_id";
export declare const INVOICE_COLUMNS = "id, org_id, number, status, currency, subtotal_cents, tax_cents, total_cents, amount_paid_cents, period_start, period_end, issued_at, paid_at, due_at, description, lines, hosted_url, pdf_url";
export declare const PAYMENT_METHOD_COLUMNS = "id, brand, last4, exp_month, exp_year, holder_name, is_default, created_at";
export declare const BILLING_PROFILE_COLUMNS = "billing_email, company_name, tax_id, address_line1, address_line2, city, region, postal_code, country";
