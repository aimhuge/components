/**
 * Billing period arithmetic and proration.
 *
 * Pure functions over milliseconds and integer cents — no DB, no clock of
 * their own (every entry point takes `now`). Money math you can't test is
 * money math you find out about from a customer.
 *
 * The proration model: a customer partway through a paid period has already
 * paid for time they won't use on the old plan. A change issues TWO lines — a
 * credit for the unused remainder of the old plan, and a charge for the same
 * remainder at the new rate. The period end does not move. The net may be
 * negative. Changing the INTERVAL is the exception: a monthly period can't be
 * stretched into a yearly one, so the remainder is credited in full and a
 * fresh full-price period opens at `now`.
 *
 * Time is prorated by elapsed milliseconds against the period's real length,
 * not by day count, so a period straddling DST or a short month is charged for
 * exactly the time it contains.
 */
import type { BillingInterval, Catalog } from "./catalog.js";
import type { InvoiceLine } from "./types.js";
export declare const DAY_MS: number;
/**
 * Advance a date by one billing interval, calendar-aware. A subscription
 * started on the 15th renews on the 15th; Jan 31 + 1 month clamps to Feb 28/29
 * rather than spilling into March, which is what `setMonth` does on its own.
 */
export declare function addInterval(from: Date, interval: BillingInterval): Date;
export interface Period {
    start: string;
    end: string;
}
/** A fresh billing period starting at `now`. */
export declare function periodFrom(now: Date, interval: BillingInterval): Period;
/**
 * The period containing `now`, rolled forward from a lapsed one by whole
 * intervals — anchored on the ORIGINAL start, so a workspace that signed up on
 * the 31st keeps renewing at month end rather than drifting to the 28th after
 * February. Returns `period` unchanged when it hasn't lapsed.
 *
 * This is how a free (or comped) subscription "renews" with nothing to bill:
 * no cron, no provider — the next read rolls it, and the usage allowance that
 * is measured against the period resets with it.
 */
export declare function rollForward(period: Period, interval: BillingInterval, now: Date): Period;
/**
 * Fraction of a period still unused at `now`, in [0, 1]. Clamped at both ends:
 * a clock skewed before the start would otherwise credit time nobody bought,
 * and a lapsed period would go negative and invent a charge.
 */
export declare function unusedFraction(now: Date, period: Period): number;
/** Whole days left in the period, rounded up — "renews in 12 days". */
export declare function daysRemaining(now: Date, period: Period): number;
/** Seats are billed, so a bad value is a billing error, not a rounding
 *  problem. The ceiling stops a fat-fingered 1000 quoting $16,000. */
export declare function clampSeats(seats: number): number;
export interface PlanTerms<P extends string> {
    plan: P;
    interval: BillingInterval;
    seats: number;
}
export interface ProrationInput<P extends string> {
    now: Date;
    period: Period;
    /** The OLD plan's price is the one frozen on the subscription, never today's
     *  catalog price — crediting at a price never paid is free money one way and
     *  a complaint the other. */
    from: PlanTerms<P> & {
        unitAmountCents: number;
    };
    to: PlanTerms<P>;
}
export interface ProrationResult {
    lines: InvoiceLine[];
    /** Net of every line. Negative means the org is owed a credit. */
    totalCents: number;
    /** The period the change lands in. Unchanged unless the interval changed. */
    period: Period;
}
export declare function prorateChange<P extends string>(catalog: Catalog<P>, input: ProrationInput<P>): ProrationResult;
/** Invoice lines for one full-price period, no proration. */
export declare function renewalLines<P extends string>(catalog: Catalog<P>, plan: P, interval: BillingInterval, seats: number, period: Period): InvoiceLine[];
/**
 * What a plan change would cost today, without performing it. Lives in the
 * pure module so the quote a customer reads and the invoice the mock issues
 * are the same arithmetic — and so a CLIENT plan picker can import it without
 * pulling a provider's server graph into the browser.
 */
export declare function previewChangeCents<P extends string>(catalog: Catalog<P>, current: {
    plan: P;
    interval: BillingInterval;
    seats: number;
    unitAmountCents: number;
    currentPeriodStart: string;
    currentPeriodEnd: string;
}, to: PlanTerms<P>, now: Date): number;
