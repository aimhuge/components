import { describe, expect, it } from "vitest";
import { assertCheckoutBranding, stripeBrandingSettings } from "../server/branding.js";
import { createRuntime } from "../server/runtime.js";
import { defineCatalog } from "../catalog.js";

const catalog = defineCatalog({
  plans: { free: { id: "free", name: "Free", monthlyUnitAmountCents: 0, perSeat: false } },
  order: ["free"],
  free: "free",
  yearlyMonthsCharged: 10,
});

describe("per-app Checkout branding on a shared Stripe account", () => {
  it("sends Stripe only the fields the app set", () => {
    expect(stripeBrandingSettings({ displayName: "Acme", logoUrl: "https://acme.test/logo.png" })).toEqual({
      display_name: "Acme",
      logo: { type: "url", url: "https://acme.test/logo.png" },
    });
    expect(
      stripeBrandingSettings({ iconUrl: "https://acme.test/i.png", buttonColor: "#ff5500", borderStyle: "pill", fontFamily: "inter" }),
    ).toEqual({
      icon: { type: "url", url: "https://acme.test/i.png" },
      button_color: "#ff5500",
      border_style: "pill",
      font_family: "inter",
    });
    expect(stripeBrandingSettings({})).toEqual({});
  });

  it("refuses at boot what Stripe would refuse at Checkout", () => {
    expect(() => assertCheckoutBranding({ logoUrl: "https://a.test/l.png", iconUrl: "https://a.test/i.png" })).toThrow(/not both/);
    expect(() => assertCheckoutBranding({ logoUrl: "http://a.test/l.png" })).toThrow(/https/);
    expect(() => assertCheckoutBranding({ buttonColor: "orange" })).toThrow(/hex/);
    expect(() => assertCheckoutBranding({ displayName: "  " })).toThrow(/blank/);
    expect(() => assertCheckoutBranding({ displayName: "Acme", backgroundColor: "#0B0B0F" })).not.toThrow();
  });

  it("is carried by the runtime, and absent unless the app passes it", () => {
    const base = { app: "acme", displayName: "Acme", catalog, invoicePrefix: "ACM", env: {} };
    expect(createRuntime(base).checkoutBranding).toBeUndefined();
    expect(createRuntime({ ...base, checkoutBranding: { displayName: "Acme" } }).checkoutBranding).toEqual({ displayName: "Acme" });
    expect(() => createRuntime({ ...base, checkoutBranding: { buttonColor: "red" } })).toThrow(/hex/);
  });
});
