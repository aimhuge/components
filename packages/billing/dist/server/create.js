import { getAccount } from "./account.js";
import { setPlanByAdmin } from "./comp.js";
import { assertCanAfford, getBalance, grantCredit, recordUsage } from "./ledger.js";
import { createMockProvider } from "./mock.js";
import { createRuntime } from "./runtime.js";
import { ensureSubscription, logBillingEvent, saveSubscription } from "./store.js";
import { createStripeHandle } from "./stripe/client.js";
import { createStripeProvider } from "./stripe/provider.js";
import { handleStripeWebhook } from "./stripe/webhook.js";
export function createBilling(config) {
    const rt = createRuntime(config);
    const stripe = createStripeHandle(rt);
    const env = { rt, stripe };
    let mock = null;
    let live = null;
    return {
        runtime: rt,
        catalog: rt.catalog,
        stripe,
        provider: () => rt.providerId === "stripe" ? (live ??= createStripeProvider(env)) : (mock ??= createMockProvider(rt)),
        subscription: (service, orgId) => ensureSubscription(rt, service, orgId),
        saveSubscription: (service, orgId, patch) => saveSubscription(rt, service, orgId, patch),
        account: (service, orgId) => getAccount(rt, service, orgId),
        logEvent: (service, orgId, kind, actorEmail, payload) => logBillingEvent(service, orgId, kind, actorEmail, payload),
        setPlanByAdmin: (service, input) => setPlanByAdmin(rt, service, input),
        balance: (service, orgId, meter) => getBalance(rt, service, orgId, meter),
        assertCanAfford: (service, orgId, meter, price, describe) => assertCanAfford(rt, service, orgId, meter, price, describe),
        recordUsage: (service, input) => recordUsage(service, input),
        grantCredit: (service, input) => grantCredit(service, input),
        handleStripeWebhook: (req, getService) => handleStripeWebhook(env, req, getService),
    };
}
