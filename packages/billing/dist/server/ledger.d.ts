/**
 * The usage ledger: metered charges against a plan's allowance.
 *
 * `org_usage_charges` is the source of truth for spend, one row per charge,
 * in the meter's unit (micros for a money meter). The balance is derived on
 * every read (see `computeBalance`), summed in the database by
 * `org_usage_total` — a client-side sum would silently stop at PostgREST's
 * row cap and undercount a busy org into overspending.
 *
 * KNOWN RACE, ACCEPTED. Two charges starting at the same instant can both pass
 * `assertCanAfford` and both be recorded, overdrawing by at most one charge.
 * The alternative — reserve, then refund on failure — charges people whose
 * work then failed, or leaks a reservation from a process that died mid-call.
 * Overdrawing by one charge is the better failure, and `remaining` is floored
 * at zero so no UI shows a negative.
 */
import type { BasePlan } from "../catalog.js";
import { type MeterBalance } from "../usage.js";
import type { Runtime, Service } from "./runtime.js";
export declare function getBalance<P extends string, T extends BasePlan<P>>(rt: Runtime<P, T>, service: Service, orgId: string, meter: string, now?: Date): Promise<MeterBalance>;
/** Throw `InsufficientCredit` when `price` exceeds what's left. Call it BEFORE
 *  the work that costs money, and `recordUsage` after the work succeeds. */
export declare function assertCanAfford<P extends string, T extends BasePlan<P>>(rt: Runtime<P, T>, service: Service, orgId: string, meter: string, price: number, describe?: (balance: MeterBalance) => string): Promise<MeterBalance>;
export interface UsageInput {
    orgId: string;
    meter: string;
    /** In the meter's unit. What the ORG is charged. */
    amount: number;
    /** What it cost US, when known — stored so the margin is on every row and a
     *  later markup change can't rewrite past prices. */
    costMicros?: number | null;
    /** What the charge was for: `("media", id)`. No FK — deleting the thing must
     *  not erase the fact it was paid for, or a balance refills by deletion. */
    refType?: string | null;
    refId?: string | null;
    metadata?: Record<string, unknown>;
    createdBy?: string | null;
    createdVia?: "app" | "mcp" | "system";
}
export declare function recordUsage(service: Service, input: UsageInput): Promise<void>;
export interface GrantInput {
    orgId: string;
    meter: string;
    amount: number;
    reason: string;
    /** Null = never expires: it adds to every window until removed. */
    expiresAt?: string | null;
    grantedBy: string | null;
}
/** Add credit on top of the plan's allowance — a trial extension, an apology,
 *  a bought bundle. Logged to the audit trail. */
export declare function grantCredit(service: Service, input: GrantInput): Promise<void>;
