import { describe, it, expect } from "vitest";
import { createRuntime } from "../server/runtime.js";
import { priceEnvName, readStripeConfig } from "../server/stripe/client.js";
import { deckCatalog } from "./fixtures.js";

/** Every required variable for the deck catalog, so each test adds or drops one. */
const BASE = {
  STRIPE_SECRET_KEY: "sk_test_123",
  STRIPE_WEBHOOK_SECRET: "whsec_123",
  STRIPE_PRICE_PRO_MONTHLY: "price_pro_m",
  STRIPE_PRICE_PRO_YEARLY: "price_pro_y",
  STRIPE_PRICE_TEAM_MONTHLY: "price_team_m",
  STRIPE_PRICE_TEAM_YEARLY: "price_team_y",
};

function config(env: Record<string, string | undefined>, priceVariants?: readonly string[]) {
  const rt = createRuntime({
    app: "deckcp",
    displayName: "DeckCP",
    catalog: deckCatalog,
    invoicePrefix: "DCP",
    siteOrigin: "https://deckcp.test",
    env,
    priceVariants,
  });
  return readStripeConfig(rt);
}

describe("priceEnvName", () => {
  it("appends the variant, uppercased, non-alphanumerics as _", () => {
    expect(priceEnvName("pro", "monthly")).toBe("STRIPE_PRICE_PRO_MONTHLY");
    expect(priceEnvName("pro", "monthly", "regional_low")).toBe("STRIPE_PRICE_PRO_MONTHLY_REGIONAL_LOW");
    expect(priceEnvName("pro", "yearly", "regional-lower.middle")).toBe(
      "STRIPE_PRICE_PRO_YEARLY_REGIONAL_LOWER_MIDDLE",
    );
  });
});

describe("readStripeConfig price variants", () => {
  it("defaults to no variants", () => {
    const rt = createRuntime({ app: "deckcp", displayName: "DeckCP", catalog: deckCatalog, invoicePrefix: "DCP", env: {} });
    expect(rt.priceVariants).toEqual([]);
    expect(config(BASE).variants).toEqual({});
  });

  it("reads the variant prices that are set", () => {
    const read = config(
      {
        ...BASE,
        STRIPE_PRICE_PRO_MONTHLY_REGIONAL_LOW: " price_pro_m_low ",
        STRIPE_PRICE_PRO_MONTHLY_REGIONAL_LOWER_MIDDLE: "price_pro_m_lm",
      },
      ["regional_low", "regional_lower_middle"],
    );
    expect(read.variants).toEqual({
      pro: { monthly: { regional_low: "price_pro_m_low", regional_lower_middle: "price_pro_m_lm" } },
    });
  });

  it("never lists an unset variant price as missing", () => {
    expect(() => config(BASE, ["regional_low"])).not.toThrow();
  });

  it("still lists the plan's own prices as missing", () => {
    const { STRIPE_PRICE_TEAM_YEARLY: _dropped, ...rest } = BASE;
    expect(() => config(rest, ["regional_low"])).toThrow(/STRIPE_PRICE_TEAM_YEARLY(?!_)/);
  });
});
