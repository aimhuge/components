const HEX = /^#[0-9a-f]{6}$/i;
/**
 * Throws on a branding Stripe would refuse, so the mistake surfaces when the
 * app boots — not as a failed Checkout in front of someone paying.
 */
export function assertCheckoutBranding(branding) {
    if (branding.logoUrl && branding.iconUrl) {
        throw new Error("billing: checkoutBranding takes a logoUrl or an iconUrl, not both (Stripe refuses both)");
    }
    for (const key of ["logoUrl", "iconUrl"]) {
        const url = branding[key];
        if (url !== undefined && !url.startsWith("https://")) {
            throw new Error(`billing: checkoutBranding.${key} must be an https URL Stripe can fetch`);
        }
    }
    for (const key of ["backgroundColor", "buttonColor"]) {
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
export function stripeBrandingSettings(branding) {
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
