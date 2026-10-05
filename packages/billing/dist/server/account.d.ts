/**
 * getAccount — the billing data every app's billing page needs, in one
 * bounded batch. Apps add their own usage meters (decks, properties, AI
 * tokens) on top; those aren't billing's to know.
 */
import type { BasePlan } from "../catalog.js";
import type { BillingAccount } from "../types.js";
import type { Runtime, Service } from "./runtime.js";
/** Two years of monthly billing — every real "can you resend that receipt"
 *  without an unbounded scan. The UI should say so when it hits the cap. */
export declare const INVOICE_HISTORY_LIMIT = 24;
export declare function getAccount<P extends string, T extends BasePlan<P>>(rt: Runtime<P, T>, service: Service, orgId: string): Promise<BillingAccount<P>>;
/** The owner's account email — the invoice recipient when no billing email is
 *  set. Resolved, not copied, so it follows an ownership change. */
export declare function resolveOwnerEmail(service: Service, orgId: string): Promise<string | null>;
