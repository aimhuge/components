/**
 * Stripe invoices → our invoice shape. Pure, like ./map.
 */
import type Stripe from "stripe";
import type { InvoiceLine, InvoiceStatus } from "../../types.js";
/** Stripe's invoice status → ours. The vocabularies happen to line up. */
export declare function toInvoiceStatus(status: Stripe.Invoice.Status | null | undefined): InvoiceStatus;
export interface InvoiceFacts {
    number: string;
    status: InvoiceStatus;
    currency: string;
    subtotalCents: number;
    taxCents: number;
    totalCents: number;
    amountPaidCents: number;
    periodStart: string | null;
    periodEnd: string | null;
    issuedAt: string;
    paidAt: string | null;
    dueAt: string | null;
    description: string;
    hostedUrl: string | null;
    pdfUrl: string | null;
    providerInvoiceId: string;
    lines: InvoiceLine[];
}
/**
 * Read a Stripe invoice into the shape our invoice table already stores.
 *
 * Amounts pass through untouched: Stripe is already in minor units, so there's
 * no conversion to get wrong, and a proration credit arrives as a genuinely
 * negative `amount` — which our schema deliberately allows.
 *
 * `number` falls back to the invoice id, because a draft invoice has no number
 * yet and the column is NOT NULL and unique.
 */
export declare function readInvoice(invoice: Stripe.Invoice): InvoiceFacts;
