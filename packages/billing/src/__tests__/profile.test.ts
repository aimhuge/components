import { describe, expect, it } from "vitest";
import { BillingError } from "../errors.js";
import { createBilling } from "../server/create.js";
import type { BillingProfileInput } from "../server/profile.js";
import { fakeSupabase } from "./fake-supabase.js";
import { deckCatalog } from "./fixtures.js";

const ORG = "33333333-3333-3333-3333-333333333333";
const OTHER = "44444444-4444-4444-4444-444444444444";
const billing = createBilling({ app: "deckcp", displayName: "DeckCP", catalog: deckCatalog, invoicePrefix: "DCP", env: {} });

const blank: BillingProfileInput = {
  billingEmail: "",
  companyName: "",
  taxId: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  region: "",
  postalCode: "",
  country: "",
};

describe("invoice", () => {
  it("finds an invoice by number only within its own org", async () => {
    const db = fakeSupabase({
      org_invoices: [{ id: "i1", org_id: ORG, number: "DCP-2026-0001", status: "paid", total_cents: 1600, lines: [] }],
    });
    expect((await billing.invoice(db.service, ORG, "DCP-2026-0001"))?.totalCents).toBe(1600);
    expect(await billing.invoice(db.service, OTHER, "DCP-2026-0001")).toBeNull();
  });
});

describe("profile", () => {
  it("reads an org with no profile as all-null", async () => {
    const db = fakeSupabase();
    expect((await billing.profile(db.service, ORG)).companyName).toBeNull();
  });

  it("normalises, caps and saves the addressee, and logs it", async () => {
    const db = fakeSupabase();
    const saved = await billing.saveProfile(
      db.service,
      ORG,
      { ...blank, billingEmail: "  AP@Acme.COM ", companyName: "x".repeat(300), country: "th" },
      "owner@acme.com",
    );
    expect(saved.billingEmail).toBe("ap@acme.com");
    expect(saved.companyName).toHaveLength(200);
    expect(saved.country).toBe("TH");
    expect(saved.city).toBeNull();
    expect(db.tables.org_billing_events![0]).toMatchObject({ kind: "billing_profile.updated", actor_email: "owner@acme.com" });
  });

  it("refuses a bad email or an unknown country with a message the customer can read", async () => {
    const db = fakeSupabase();
    await expect(billing.saveProfile(db.service, ORG, { ...blank, billingEmail: "nope" }, null)).rejects.toBeInstanceOf(BillingError);
    await expect(billing.saveProfile(db.service, ORG, { ...blank, country: "ZZ" }, null)).rejects.toThrow(/country/);
    expect(db.tables.org_billing_profiles ?? []).toHaveLength(0);
  });
});
