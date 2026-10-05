/**
 * Metered-usage balances — the pure half of the usage ledger.
 *
 * BALANCE = the plan's allowance + active grants − usage in the window.
 *
 * Derived from ledger rows on every read, never kept as a counter: a counter
 * drifts from the rows that justify it, and at a few hundred charges a period
 * the aggregate is free.
 *
 * THE WINDOW is the subscription's current period when the allowance resets,
 * and all time when it doesn't (`resets: false`, e.g. a Free plan's one-off
 * image credit). Grants follow the same window — a grant counts while it is
 * unexpired, so a one-off top-up for this period is a grant that expires at
 * the period end, and an apology that should last is one that doesn't.
 */
import type { Allowance } from "./catalog.js";
import type { Period } from "./period.js";
export interface MeterBalance {
    meter: string;
    /** What the plan grants in this window. 0 when the plan has no allowance. */
    allowance: number;
    /** Unexpired grants on top of the allowance. */
    granted: number;
    /** Usage recorded in the window. */
    spent: number;
    /** allowance + granted − spent, floored at 0 so no UI shows a negative. */
    remaining: number;
    /** Null start = lifetime. */
    window: {
        start: string | null;
        end: string | null;
    };
    resets: boolean;
}
/** The span usage is summed over for one meter. */
export declare function usageWindow(allowance: Allowance | null, period: Period): {
    start: string | null;
    end: string | null;
};
export declare function computeBalance(input: {
    meter: string;
    allowance: Allowance | null;
    period: Period;
    grants: readonly {
        amount: number;
        expiresAt: string | null;
    }[];
    spent: number;
    now: Date;
}): MeterBalance;
