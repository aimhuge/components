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

export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Advance a date by one billing interval, calendar-aware. A subscription
 * started on the 15th renews on the 15th; Jan 31 + 1 month clamps to Feb 28/29
 * rather than spilling into March, which is what `setMonth` does on its own.
 */
export function addInterval(from: Date, interval: BillingInterval): Date {
  const next = new Date(from.getTime());
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + (interval === "yearly" ? 12 : 1));
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

export interface Period {
  start: string;
  end: string;
}

/** A fresh billing period starting at `now`. */
export function periodFrom(now: Date, interval: BillingInterval): Period {
  return { start: now.toISOString(), end: addInterval(now, interval).toISOString() };
}

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
export function rollForward(period: Period, interval: BillingInterval, now: Date): Period {
  if (new Date(period.end).getTime() > now.getTime()) return period;
  const anchor = new Date(period.start);
  if (!Number.isFinite(anchor.getTime())) return periodFrom(now, interval);
  let k = 0;
  let start = anchor;
  let end = nthInterval(anchor, interval, 1);
  // Bounded: 1,200 monthly steps is a century of dormancy.
  while (end.getTime() <= now.getTime() && k < 1_200) {
    k += 1;
    start = end;
    end = nthInterval(anchor, interval, k + 1);
  }
  return { start: start.toISOString(), end: end.toISOString() };
}

/** `anchor` + n intervals, computed from the anchor each time so the clamp of
 *  one short month never carries into the next. */
function nthInterval(anchor: Date, interval: BillingInterval, n: number): Date {
  const day = anchor.getUTCDate();
  const months = n * (interval === "yearly" ? 12 : 1);
  const target = new Date(anchor.getTime());
  target.setUTCDate(1);
  target.setUTCMonth(anchor.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

/**
 * Fraction of a period still unused at `now`, in [0, 1]. Clamped at both ends:
 * a clock skewed before the start would otherwise credit time nobody bought,
 * and a lapsed period would go negative and invent a charge.
 */
export function unusedFraction(now: Date, period: Period): number {
  const start = new Date(period.start).getTime();
  const end = new Date(period.end).getTime();
  const length = end - start;
  if (!Number.isFinite(length) || length <= 0) return 0;
  const remaining = end - now.getTime();
  if (remaining <= 0) return 0;
  if (remaining >= length) return 1;
  return remaining / length;
}

/** Whole days left in the period, rounded up — "renews in 12 days". */
export function daysRemaining(now: Date, period: Period): number {
  const remaining = new Date(period.end).getTime() - now.getTime();
  return remaining <= 0 ? 0 : Math.ceil(remaining / DAY_MS);
}

/** Seats are billed, so a bad value is a billing error, not a rounding
 *  problem. The ceiling stops a fat-fingered 1000 quoting $16,000. */
export function clampSeats(seats: number): number {
  const n = Math.trunc(seats);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 500);
}

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
  from: PlanTerms<P> & { unitAmountCents: number };
  to: PlanTerms<P>;
}

export interface ProrationResult {
  lines: InvoiceLine[];
  /** Net of every line. Negative means the org is owed a credit. */
  totalCents: number;
  /** The period the change lands in. Unchanged unless the interval changed. */
  period: Period;
}

export function prorateChange<P extends string>(
  catalog: Catalog<P>,
  input: ProrationInput<P>,
): ProrationResult {
  const { now, period, from, to } = input;
  const remaining = unusedFraction(now, period);
  const name = (plan: P) => catalog.get(plan).name;
  const seatsLabel = (n: number) => `${n} seat${n === 1 ? "" : "s"}`;

  const creditCents = -Math.round(from.unitAmountCents * Math.max(1, from.seats) * remaining);
  const lines: InvoiceLine[] = [];

  if (creditCents !== 0) {
    lines.push({
      description: `Unused time on ${name(from.plan)} (${seatsLabel(from.seats)})`,
      quantity: from.seats,
      unitAmountCents: from.unitAmountCents,
      amountCents: creditCents,
      periodStart: now.toISOString(),
      periodEnd: period.end,
      proration: true,
    });
  }

  if (from.interval !== to.interval) {
    const nextPeriod = periodFrom(now, to.interval);
    lines.push(...renewalLines(catalog, to.plan, to.interval, to.seats, nextPeriod));
    return { lines, totalCents: sum(lines), period: nextPeriod };
  }

  const newFullCents = catalog.totalCents(to.plan, to.interval, to.seats);
  const chargeCents = Math.round(newFullCents * remaining);
  if (chargeCents !== 0) {
    lines.push({
      description: `Remaining time on ${name(to.plan)} (${seatsLabel(to.seats)})`,
      quantity: to.seats,
      unitAmountCents: newFullCents / Math.max(1, to.seats),
      amountCents: chargeCents,
      periodStart: now.toISOString(),
      periodEnd: period.end,
      proration: true,
    });
  }
  return { lines, totalCents: sum(lines), period };
}

/** Invoice lines for one full-price period, no proration. */
export function renewalLines<P extends string>(
  catalog: Catalog<P>,
  plan: P,
  interval: BillingInterval,
  seats: number,
  period: Period,
): InvoiceLine[] {
  const amount = catalog.totalCents(plan, interval, seats);
  if (amount === 0) return [];
  return [
    {
      description: `${catalog.get(plan).name} — ${interval === "yearly" ? "annual" : "monthly"} (${seats} seat${seats === 1 ? "" : "s"})`,
      quantity: seats,
      unitAmountCents: amount / Math.max(1, seats),
      amountCents: amount,
      periodStart: period.start,
      periodEnd: period.end,
    },
  ];
}

/**
 * What a plan change would cost today, without performing it. Lives in the
 * pure module so the quote a customer reads and the invoice the mock issues
 * are the same arithmetic — and so a CLIENT plan picker can import it without
 * pulling a provider's server graph into the browser.
 */
export function previewChangeCents<P extends string>(
  catalog: Catalog<P>,
  current: {
    plan: P;
    interval: BillingInterval;
    seats: number;
    unitAmountCents: number;
    currentPeriodStart: string;
    currentPeriodEnd: string;
  },
  to: PlanTerms<P>,
  now: Date,
): number {
  const seats = clampSeats(to.seats);
  // Nothing paid behind them — a first purchase is a full-price period.
  if (current.unitAmountCents === 0) {
    return sum(renewalLines(catalog, to.plan, to.interval, seats, periodFrom(now, to.interval)));
  }
  return prorateChange(catalog, {
    now,
    period: { start: current.currentPeriodStart, end: current.currentPeriodEnd },
    from: current,
    to: { ...to, seats },
  }).totalCents;
}

function sum(lines: InvoiceLine[]): number {
  return lines.reduce((total, line) => total + line.amountCents, 0);
}
