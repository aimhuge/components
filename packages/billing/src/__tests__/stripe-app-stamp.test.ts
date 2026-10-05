import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { asId, invoiceSubscriptionId, stripeObjectApp } from "../server/stripe/map.js";

describe("app stamps on a shared Stripe account", () => {
  it("reads metadata.app off an object, or off an invoice's subscription", () => {
    expect(stripeObjectApp({ metadata: { app: "blastcp" } })).toBe("blastcp");
    expect(
      stripeObjectApp({ metadata: {}, parent: { subscription_details: { metadata: { app: "deckcp" } } } }),
    ).toBe("deckcp");
    expect(stripeObjectApp({ metadata: {}, subscription_details: { metadata: { app: "deckcp" } } })).toBe("deckcp");
  });

  it("says nothing when nothing is stamped", () => {
    expect(stripeObjectApp({ metadata: {} })).toBeNull();
    expect(stripeObjectApp(null)).toBeNull();
    expect(stripeObjectApp({ id: "pm_1" })).toBeNull();
  });

  it("reads references whether Stripe expanded them or not", () => {
    expect(asId("cus_1")).toBe("cus_1");
    expect(asId({ id: "cus_2" })).toBe("cus_2");
    expect(asId(null)).toBeNull();
    expect(
      invoiceSubscriptionId({ parent: { subscription_details: { subscription: "sub_9" } } } as unknown as Stripe.Invoice),
    ).toBe("sub_9");
  });
});
