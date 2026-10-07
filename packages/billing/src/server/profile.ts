/**
 * The invoice addressee and single-invoice reads — the billing-page pieces
 * that don't go through a provider, because they change nothing about what is
 * charged, only what a receipt says.
 */
import { isCountryCode } from "../countries.js";
import { BillingError } from "../errors.js";
import type { BillingProfile, Invoice } from "../types.js";
import {
  BILLING_PROFILE_COLUMNS,
  INVOICE_COLUMNS,
  toBillingProfile,
  toInvoice,
  type BillingProfileRow,
  type InvoiceRow,
} from "./rows.js";
import type { Service } from "./runtime.js";
import { logBillingEvent } from "./store.js";

/** One invoice by its human number, scoped to the org — another org's number
 *  simply isn't found, so a guessed URL can't open someone else's receipt. */
export async function getInvoice(service: Service, orgId: string, number: string): Promise<Invoice | null> {
  const { data } = await service
    .from("org_invoices")
    .select(INVOICE_COLUMNS)
    .eq("org_id", orgId)
    .eq("number", number)
    .maybeSingle();
  return data ? toInvoice(data as InvoiceRow) : null;
}

export async function getProfile(service: Service, orgId: string): Promise<BillingProfile> {
  const { data } = await service
    .from("org_billing_profiles")
    .select(BILLING_PROFILE_COLUMNS)
    .eq("org_id", orgId)
    .maybeSingle();
  return toBillingProfile((data as BillingProfileRow | null) ?? null);
}

/** What a billing-profile form submits: every field a string, blank = unset. */
export type BillingProfileInput = { [K in keyof BillingProfile]: string };

/**
 * Validate and save the invoice addressee. Throws `BillingError` (safe to show)
 * for a bad email or an unknown country; trims and caps every field so a pasted
 * essay can't land on an invoice. Logged to the audit trail.
 */
export async function saveProfile(
  service: Service,
  orgId: string,
  input: BillingProfileInput,
  actorEmail: string | null,
): Promise<BillingProfile> {
  const billingEmail = input.billingEmail.trim().toLowerCase();
  if (billingEmail && (!billingEmail.includes("@") || billingEmail.length > 254)) {
    throw new BillingError("That doesn't look like an email address.");
  }
  const country = input.country.trim().toUpperCase();
  if (country && !isCountryCode(country)) throw new BillingError("Choose a country from the list.");

  const { data, error } = await service
    .from("org_billing_profiles")
    .upsert(
      {
        org_id: orgId,
        billing_email: billingEmail || null,
        company_name: trimToNull(input.companyName, 200),
        tax_id: trimToNull(input.taxId, 60),
        address_line1: trimToNull(input.addressLine1, 200),
        address_line2: trimToNull(input.addressLine2, 200),
        city: trimToNull(input.city, 100),
        region: trimToNull(input.region, 100),
        postal_code: trimToNull(input.postalCode, 32),
        country: country || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id" },
    )
    .select(BILLING_PROFILE_COLUMNS)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not save the billing details");

  await logBillingEvent(service, orgId, "billing_profile.updated", actorEmail);
  return toBillingProfile(data as BillingProfileRow);
}

function trimToNull(value: string, max: number): string | null {
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
}
