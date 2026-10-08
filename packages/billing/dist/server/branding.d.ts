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
/**
 * Throws on a branding Stripe would refuse, so the mistake surfaces when the
 * app boots — not as a failed Checkout in front of someone paying.
 */
export declare function assertCheckoutBranding(branding: CheckoutBranding): void;
/** The Checkout session's `branding_settings`, with only the fields the app set. */
export declare function stripeBrandingSettings(branding: CheckoutBranding): Stripe.Checkout.SessionCreateParams.BrandingSettings;
