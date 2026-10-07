import type { BillingProfile, Invoice } from "../types.js";
import type { Service } from "./runtime.js";
/** One invoice by its human number, scoped to the org — another org's number
 *  simply isn't found, so a guessed URL can't open someone else's receipt. */
export declare function getInvoice(service: Service, orgId: string, number: string): Promise<Invoice | null>;
export declare function getProfile(service: Service, orgId: string): Promise<BillingProfile>;
/** What a billing-profile form submits: every field a string, blank = unset. */
export type BillingProfileInput = {
    [K in keyof BillingProfile]: string;
};
/**
 * Validate and save the invoice addressee. Throws `BillingError` (safe to show)
 * for a bad email or an unknown country; trims and caps every field so a pasted
 * essay can't land on an invoice. Logged to the audit trail.
 */
export declare function saveProfile(service: Service, orgId: string, input: BillingProfileInput, actorEmail: string | null): Promise<BillingProfile>;
