import { assertCheckoutBranding } from "./branding.js";
const APP_SLUG = /^[a-z0-9][a-z0-9-]{0,30}$/;
const PREFIX = /^[A-Z]{2,5}$/;
export function createRuntime(config) {
    if (!APP_SLUG.test(config.app)) {
        throw new Error(`billing: app "${config.app}" must be a lowercase slug (it is stamped on Stripe objects)`);
    }
    if (!PREFIX.test(config.invoicePrefix)) {
        throw new Error(`billing: invoicePrefix "${config.invoicePrefix}" must be 2–5 capital letters`);
    }
    if (config.checkoutBranding)
        assertCheckoutBranding(config.checkoutBranding);
    const env = config.env ?? process.env;
    const configured = (config.provider ?? env.BILLING_PROVIDER ?? "mock").toLowerCase();
    return {
        app: config.app,
        displayName: config.displayName,
        url: config.url,
        catalog: config.catalog,
        invoicePrefix: config.invoicePrefix,
        meteredStatuses: config.meteredStatuses ?? ["active", "trialing", "past_due"],
        env,
        // Anything other than "stripe" runs the mock. "No provider configured" is
        // every developer's machine and CI, and the mock says loudly that it moves
        // no money. Selecting Stripe with missing config throws at first use.
        providerId: configured === "stripe" ? "stripe" : "mock",
        checkoutBranding: config.checkoutBranding,
        mockCheckoutPath: config.mockCheckoutPath ?? ((slug) => `/${slug}/billing/checkout`),
        siteOrigin: () => (config.siteOrigin ?? env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
        async notifyPlanChange(event) {
            if (!config.onPlanChange || event.from === event.to)
                return;
            try {
                await config.onPlanChange(event);
            }
            catch (error) {
                console.warn(`[billing:${config.app}] onPlanChange failed`, error);
            }
        },
    };
}
