/**
 * DB row shapes and their mappers to the domain types. Pure — no database.
 *
 * Defensive about enum-ish columns: a row written by a future provider (or a
 * hand-edited one) narrows to a safe value rather than widening the domain
 * type. A plan the catalog doesn't know reads as free — the direction that
 * under-grants rather than over-grants.
 */
import { isBillingInterval } from "../catalog.js";
import { INVOICE_STATUSES, SUBSCRIPTION_STATUSES, } from "../types.js";
export function asProvider(value) {
    return value === "stripe" ? "stripe" : "mock";
}
export function toSubscription(catalog, row) {
    return {
        orgId: row.org_id,
        plan: catalog.isPlanId(row.plan) ? row.plan : catalog.free,
        status: SUBSCRIPTION_STATUSES.includes(row.status)
            ? row.status
            : "active",
        interval: isBillingInterval(row.billing_interval) ? row.billing_interval : "monthly",
        seats: Math.max(1, row.seats ?? 1),
        unitAmountCents: row.unit_amount_cents ?? 0,
        currency: row.currency ?? "usd",
        currentPeriodStart: row.current_period_start,
        currentPeriodEnd: row.current_period_end,
        cancelAtPeriodEnd: !!row.cancel_at_period_end,
        canceledAt: row.canceled_at,
        trialEnd: row.trial_end,
        provider: asProvider(row.provider),
        providerCustomerId: row.provider_customer_id,
        providerSubscriptionId: row.provider_subscription_id,
    };
}
/** `lines` is jsonb, so it is validated rather than cast: a malformed row
 *  renders no lines instead of taking the billing page down. */
export function toInvoiceLines(value) {
    if (!Array.isArray(value))
        return [];
    return value.flatMap((entry) => {
        if (!entry || typeof entry !== "object")
            return [];
        const line = entry;
        if (typeof line.description !== "string" || typeof line.amountCents !== "number")
            return [];
        return [
            {
                description: line.description,
                quantity: typeof line.quantity === "number" ? line.quantity : 1,
                unitAmountCents: typeof line.unitAmountCents === "number" ? line.unitAmountCents : 0,
                amountCents: line.amountCents,
                periodStart: typeof line.periodStart === "string" ? line.periodStart : undefined,
                periodEnd: typeof line.periodEnd === "string" ? line.periodEnd : undefined,
                proration: line.proration === true,
            },
        ];
    });
}
export function toInvoice(row) {
    return {
        id: row.id,
        orgId: row.org_id,
        number: row.number,
        status: INVOICE_STATUSES.includes(row.status)
            ? row.status
            : "open",
        currency: row.currency ?? "usd",
        subtotalCents: row.subtotal_cents ?? 0,
        taxCents: row.tax_cents ?? 0,
        totalCents: row.total_cents ?? 0,
        amountPaidCents: row.amount_paid_cents ?? 0,
        periodStart: row.period_start,
        periodEnd: row.period_end,
        issuedAt: row.issued_at,
        paidAt: row.paid_at,
        dueAt: row.due_at,
        description: row.description,
        lines: toInvoiceLines(row.lines),
        hostedUrl: row.hosted_url,
        pdfUrl: row.pdf_url,
    };
}
export function toPaymentMethod(row) {
    return {
        id: row.id,
        brand: row.brand,
        last4: row.last4,
        expMonth: row.exp_month,
        expYear: row.exp_year,
        holderName: row.holder_name,
        isDefault: !!row.is_default,
        createdAt: row.created_at,
    };
}
export function toBillingProfile(row) {
    return {
        billingEmail: row?.billing_email ?? null,
        companyName: row?.company_name ?? null,
        taxId: row?.tax_id ?? null,
        addressLine1: row?.address_line1 ?? null,
        addressLine2: row?.address_line2 ?? null,
        city: row?.city ?? null,
        region: row?.region ?? null,
        postalCode: row?.postal_code ?? null,
        country: row?.country ?? null,
    };
}
// Single unbroken literals: supabase-js parses select strings at the TYPE
// level, and a concatenation widens to `string`.
// prettier-ignore
export const SUBSCRIPTION_COLUMNS = "org_id, plan, status, billing_interval, seats, unit_amount_cents, currency, current_period_start, current_period_end, cancel_at_period_end, canceled_at, trial_end, provider, provider_customer_id, provider_subscription_id";
// prettier-ignore
export const INVOICE_COLUMNS = "id, org_id, number, status, currency, subtotal_cents, tax_cents, total_cents, amount_paid_cents, period_start, period_end, issued_at, paid_at, due_at, description, lines, hosted_url, pdf_url";
// prettier-ignore
export const PAYMENT_METHOD_COLUMNS = "id, brand, last4, exp_month, exp_year, holder_name, is_default, created_at";
// prettier-ignore
export const BILLING_PROFILE_COLUMNS = "billing_email, company_name, tax_id, address_line1, address_line2, city, region, postal_code, country";
