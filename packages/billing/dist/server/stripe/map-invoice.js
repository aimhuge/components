import { fromUnix } from "./map.js";
/** Stripe's invoice status → ours. The vocabularies happen to line up. */
export function toInvoiceStatus(status) {
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
export function readInvoice(invoice) {
    const lines = (invoice.lines?.data ?? []).map((line) => ({
        description: line.description ?? "Subscription",
        quantity: line.quantity ?? 1,
        // Stripe exposes the per-unit figure inconsistently across line types, so
        // derive it. On a proration line quantity × unit legitimately doesn't equal
        // amount — which is exactly why the UI renders `amountCents` and treats the
        // other two as explanation.
        unitAmountCents: line.quantity && line.quantity > 0 ? Math.round(line.amount / line.quantity) : line.amount,
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
function readProration(line) {
    const loose = line;
    return loose.proration === true || loose.parent?.subscription_item_details?.proration === true;
}
/** Tax moved from a scalar to a breakdown array across versions; support both. */
function readTax(invoice) {
    const loose = invoice;
    if (typeof loose.tax === "number")
        return loose.tax;
    if (Array.isArray(loose.total_taxes)) {
        return loose.total_taxes.reduce((sum, entry) => sum + (entry.amount ?? 0), 0);
    }
    return 0;
}
/** Newer versions stamp payment in `status_transitions`, not on the invoice. */
function readPaidAt(invoice) {
    const loose = invoice;
    const paidAt = fromUnix(loose.status_transitions?.paid_at);
    if (paidAt)
        return paidAt;
    return invoice.status === "paid" ? fromUnix(invoice.created) : null;
}
function describeInvoice(invoice) {
    const first = invoice.lines?.data?.[0]?.description;
    if (first)
        return first;
    return (invoice.total ?? 0) < 0 ? "Credit" : "Subscription";
}
