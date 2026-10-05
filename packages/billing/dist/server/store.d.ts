/**
 * Billing writes: the subscription mirror, invoice issue, and the audit trail.
 *
 * Providers call these; app code reads through them. Two invariants are
 * checkable by reading this one file:
 *
 *  1. A tier change is a SUBSCRIPTION change. An app that mirrors the tier
 *     elsewhere (DeckCP's `orgs.plan`) does it with a database trigger on
 *     `org_subscriptions`, never with a second write from here — a failure
 *     between two requests is how a mirror drifts for weeks.
 *
 *  2. An invoice is written once, with its amounts already decided. Nothing
 *     here recomputes a total from the catalog.
 */
import type { BasePlan, BillingInterval } from "../catalog.js";
import type { BillingProviderId, Invoice, InvoiceLine, InvoiceStatus, Subscription } from "../types.js";
import type { Runtime, Service } from "./runtime.js";
/**
 * True when nothing upstream renews this subscription, so the app must: a free
 * or comped ($0) row with no live Stripe subscription behind it. Its lapsed
 * period is rolled forward on read, and the usage allowance measured against
 * it resets with it. A PAID period is never rolled here — under Stripe the
 * webhook moves it, and under the mock a free renewal would hide that the mock
 * doesn't bill renewals.
 */
export declare function rollsOnRead(subscription: Subscription): boolean;
/**
 * Read the org's subscription, creating the default free row on first touch.
 *
 * Lazy rather than at signup: orgs predate billing, so a backfill would have
 * to be perfect forever and every new code path would have to remember. An org
 * with no row simply IS free, and the first billing read makes that explicit.
 * The insert is an upsert on the PK, so two concurrent first reads settle into
 * one row instead of one throwing.
 */
export declare function ensureSubscription<P extends string, T extends BasePlan<P>>(rt: Runtime<P, T>, service: Service, orgId: string, now?: Date): Promise<Subscription<P>>;
export interface SubscriptionPatch<P extends string> {
    plan?: P;
    status?: Subscription["status"];
    interval?: BillingInterval;
    seats?: number;
    unitAmountCents?: number;
    currentPeriodStart?: string;
    currentPeriodEnd?: string;
    cancelAtPeriodEnd?: boolean;
    canceledAt?: string | null;
    trialEnd?: string | null;
    provider?: BillingProviderId;
    providerCustomerId?: string | null;
    providerSubscriptionId?: string | null;
}
/**
 * Apply a patch to the org's subscription. A canceled subscription still
 * reports its paid tier until the period actually ends — downgrading at cancel
 * time would revoke features the customer already paid through.
 */
export declare function saveSubscription<P extends string, T extends BasePlan<P>>(rt: Runtime<P, T>, service: Service, orgId: string, patch: SubscriptionPatch<P>): Promise<Subscription<P>>;
/** Append to the audit trail. Never throws — losing a log line must not fail
 *  a payment the provider has already taken. */
export declare function logBillingEvent(service: Service, orgId: string, kind: string, actorEmail: string | null, payload?: Record<string, unknown>): Promise<void>;
export interface IssueInvoiceInput {
    lines: InvoiceLine[];
    status: InvoiceStatus;
    description: string;
    periodStart?: string;
    periodEnd?: string;
    currency?: string;
    provider?: BillingProviderId;
    providerInvoiceId?: string | null;
    /** Charged instantly — stamps paid_at and amount_paid. */
    paid?: boolean;
}
/**
 * Write an invoice. Totals come from the lines, once. A credit note (a
 * downgrade whose credit exceeds the new charge) issues `paid` with a negative
 * total — the money is owed TO the customer, so `open` would show a bill.
 */
export declare function issueInvoice(rt: Runtime, service: Service, orgId: string, input: IssueInvoiceInput): Promise<Invoice>;
/** Re-read the mirror, so callers get the persisted truth after a sync. */
export declare function loadSubscription<P extends string, T extends BasePlan<P>>(rt: Runtime<P, T>, service: Service, orgId: string): Promise<Subscription<P>>;
