/**
 * One app's look on Stripe Checkout, for apps that share one Stripe account.
 *
 * The account's dashboard branding belongs to the company that owns the
 * account. An app that wants Checkout to carry ITS name and logo passes
 * `checkoutBranding` to `createBilling`, and every Checkout session it opens
 * overrides the dashboard with it (Stripe's `branding_settings`, API
 * 2025-09-30 and later). The package knows no brand: each app passes its own,
 * and an app that passes nothing gets the dashboard's.
 *
 * Only Checkout can be branded per app. Receipts, invoice emails, the customer
 * portal and the card statement always carry the account's branding — an app
 * that needs those to be its own needs its own Stripe account.
 */
import type Stripe from "stripe";

export interface CheckoutBranding {
  /** The business name Checkout shows, e.g. "BlastCP". */
  displayName?: string;
  /** An https URL to a logo. Stripe takes a logo OR an icon, never both. */
  logoUrl?: string;
  /** An https URL to a square icon, for an app with no wide logo. */
  iconUrl?: string;
  /** `#rrggbb`. */
  backgroundColor?: string;
  /** `#rrggbb`. */
  buttonColor?: string;
  /** One of Stripe's Checkout fonts: "inter", "montserrat", "default", … */
  fontFamily?: string;
  borderStyle?: "rounded" | "rectangular" | "pill";
}

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Throws on a branding Stripe would refuse, so the mistake surfaces when the
 * app boots — not as a failed Checkout in front of someone paying.
 */
export function assertCheckoutBranding(branding: CheckoutBranding): void {
  if (branding.logoUrl && branding.iconUrl) {
    throw new Error("billing: checkoutBranding takes a logoUrl or an iconUrl, not both (Stripe refuses both)");
  }
  for (const key of ["logoUrl", "iconUrl"] as const) {
    const url = branding[key];
    if (url !== undefined && !url.startsWith("https://")) {
      throw new Error(`billing: checkoutBranding.${key} must be an https URL Stripe can fetch`);
    }
  }
  for (const key of ["backgroundColor", "buttonColor"] as const) {
    const color = branding[key];
    if (color !== undefined && !HEX.test(color)) {
      throw new Error(`billing: checkoutBranding.${key} "${color}" must be a #rrggbb hex color`);
    }
  }
  if (branding.displayName !== undefined && !branding.displayName.trim()) {
    throw new Error("billing: checkoutBranding.displayName is blank; leave it out to use the dashboard's name");
  }
}

/** The Checkout session's `branding_settings`, with only the fields the app set. */
export function stripeBrandingSettings(
  branding: CheckoutBranding,
): Stripe.Checkout.SessionCreateParams.BrandingSettings {
  return {
    ...(branding.displayName !== undefined && { display_name: branding.displayName }),
    ...(branding.logoUrl !== undefined && { logo: { type: "url", url: branding.logoUrl } }),
    ...(branding.iconUrl !== undefined && { icon: { type: "url", url: branding.iconUrl } }),
    ...(branding.backgroundColor !== undefined && { background_color: branding.backgroundColor }),
    ...(branding.buttonColor !== undefined && { button_color: branding.buttonColor }),
    ...(branding.fontFamily !== undefined && { font_family: branding.fontFamily }),
    ...(branding.borderStyle !== undefined && { border_style: branding.borderStyle }),
  };
}
