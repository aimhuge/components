/**
 * getAccount — the billing data every app's billing page needs, in one
 * bounded batch. Apps add their own usage meters (decks, properties, AI
 * tokens) on top; those aren't billing's to know.
 */
import type { BasePlan } from "../catalog.js";
import type { BillingAccount } from "../types.js";
import {
  BILLING_PROFILE_COLUMNS,
  INVOICE_COLUMNS,
  PAYMENT_METHOD_COLUMNS,
  toBillingProfile,
  toInvoice,
  toPaymentMethod,
  type BillingProfileRow,
  type InvoiceRow,
  type PaymentMethodRow,
} from "./rows.js";
import type { Runtime, Service } from "./runtime.js";
import { ensureSubscription } from "./store.js";

/** Two years of monthly billing — every real "can you resend that receipt"
 *  without an unbounded scan. The UI should say so when it hits the cap. */
export const INVOICE_HISTORY_LIMIT = 24;

export async function getAccount<P extends string, T extends BasePlan<P>>(
  rt: Runtime<P, T>,
  service: Service,
  orgId: string,
): Promise<BillingAccount<P>> {
  // The subscription first and alone: it may need creating (or rolling)
  // before anything measured against its period can be read.
  const subscription = await ensureSubscription(rt, service, orgId);

  const [{ count: memberCount }, { data: invoiceRows }, { data: methodRows }, { data: profileRow }, ownerEmail] =
    await Promise.all([
      service.from("org_memberships").select("user_id", { count: "exact", head: true }).eq("org_id", orgId),
      service
        .from("org_invoices")
        .select(INVOICE_COLUMNS)
        .eq("org_id", orgId)
        .order("issued_at", { ascending: false })
        .limit(INVOICE_HISTORY_LIMIT),
      service
        .from("org_payment_methods")
        .select(PAYMENT_METHOD_COLUMNS)
        .eq("org_id", orgId)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false }),
      service.from("org_billing_profiles").select(BILLING_PROFILE_COLUMNS).eq("org_id", orgId).maybeSingle(),
      resolveOwnerEmail(service, orgId),
    ]);

  return {
    subscription,
    invoices: ((invoiceRows ?? []) as InvoiceRow[]).map(toInvoice),
    paymentMethods: ((methodRows ?? []) as PaymentMethodRow[]).map(toPaymentMethod),
    profile: toBillingProfile((profileRow as BillingProfileRow | null) ?? null),
    memberCount: memberCount ?? 0,
    ownerEmail,
    provider: rt.providerId,
  };
}

/** The owner's account email — the invoice recipient when no billing email is
 *  set. Resolved, not copied, so it follows an ownership change. */
export async function resolveOwnerEmail(service: Service, orgId: string): Promise<string | null> {
  const { data: membership } = await service
    .from("org_memberships")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("role", "owner")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const ownerId = membership?.user_id as string | undefined;
  if (!ownerId) return null;
  const { data: profile } = await service.from("profiles").select("email").eq("id", ownerId).maybeSingle();
  return (profile?.email as string | null) ?? null;
}
