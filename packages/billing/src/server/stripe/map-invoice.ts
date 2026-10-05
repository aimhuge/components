/**
 * Stripe invoices → our invoice shape. Pure, like ./map.
 */
import type Stripe from "stripe";
import type { InvoiceLine, InvoiceStatus } from "../../types.js";
import { fromUnix } from "./map.js";

/** Stripe's invoice status → ours. The vocabularies happen to line up. */
export function toInvoiceStatus(status: Stripe.Invoice.Status | null | undefined): InvoiceStatus {
  switch (status) {
    case "paid":
      return "paid";
    case "open":
      return "open";
    case "draft":
      return "draft";
    case "void":
      return "void";
    case "uncollectible":
      return "uncollectible";
    default:
      return "open";
  }
}

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
export function readInvoice(invoice: Stripe.Invoice): InvoiceFacts {
  const lines: InvoiceLine[] = (invoice.lines?.data ?? []).map((line) => ({
    description: line.description ?? "Subscription",
    quantity: line.quantity ?? 1,
    // Stripe exposes the per-unit figure inconsistently across line types, so
    // derive it. On a proration line quantity × unit legitimately doesn't equal
    // amount — which is exactly why the UI renders `amountCents` and treats the
    // other two as explanation.
    unitAmountCents:
      line.quantity && line.quantity > 0 ? Math.round(line.amount / line.quantity) : line.amount,
    amountCents: line.amount,
    periodStart: fromUnix(line.period?.start) ?? undefined,
    periodEnd: fromUnix(line.period?.end) ?? undefined,
    proration: readProration(line),
  }));

  return {
    number: invoice.number ?? invoice.id ?? "",
    status: toInvoiceStatus(invoice.status),
    currency: (invoice.currency ?? "usd").toLowerCase(),
    subtotalCents: invoice.subtotal ?? 0,
    taxCents: readTax(invoice),
    totalCents: invoice.total ?? 0,
    amountPaidCents: invoice.amount_paid ?? 0,
    periodStart: fromUnix(invoice.period_start),
    periodEnd: fromUnix(invoice.period_end),
    issuedAt: fromUnix(invoice.created) ?? new Date().toISOString(),
    paidAt: readPaidAt(invoice),
    dueAt: fromUnix(invoice.due_date),
    description: invoice.description ?? describeInvoice(invoice),
    hostedUrl: invoice.hosted_invoice_url ?? null,
    pdfUrl: invoice.invoice_pdf ?? null,
    providerInvoiceId: invoice.id ?? "",
    lines,
  };
}

/** `proration` sits on the line in older shapes and under `parent` in newer
 *  ones; read it loosely rather than pinning to one and losing the flag. */
function readProration(line: Stripe.InvoiceLineItem): boolean {
  const loose = line as unknown as {
    proration?: boolean;
    parent?: { subscription_item_details?: { proration?: boolean } | null } | null;
  };
  return loose.proration === true || loose.parent?.subscription_item_details?.proration === true;
}

/** Tax moved from a scalar to a breakdown array across versions; support both. */
function readTax(invoice: Stripe.Invoice): number {
  const loose = invoice as unknown as {
    tax?: number | null;
    total_taxes?: { amount?: number }[] | null;
  };
  if (typeof loose.tax === "number") return loose.tax;
  if (Array.isArray(loose.total_taxes)) {
    return loose.total_taxes.reduce((sum, entry) => sum + (entry.amount ?? 0), 0);
  }
  return 0;
}

/** Newer versions stamp payment in `status_transitions`, not on the invoice. */
function readPaidAt(invoice: Stripe.Invoice): string | null {
  const loose = invoice as unknown as {
    status_transitions?: { paid_at?: number | null } | null;
  };
  const paidAt = fromUnix(loose.status_transitions?.paid_at);
  if (paidAt) return paidAt;
  return invoice.status === "paid" ? fromUnix(invoice.created) : null;
}

function describeInvoice(invoice: Stripe.Invoice): string {
  const first = invoice.lines?.data?.[0]?.description;
  if (first) return first;
  return (invoice.total ?? 0) < 0 ? "Credit" : "Subscription";
}
