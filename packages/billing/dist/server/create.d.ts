/**
 * createBilling — one call per app binds the whole server half to that app's
 * catalog, Stripe prices and hooks.
 *
 *   // src/lib/billing/billing.ts (server-only)
 *   export const billing = createBilling({
 *     app: "deckcp", displayName: "DeckCP", url: "https://deckcp.com",
 *     catalog, invoicePrefix: "DCP",
 *     onPlanChange: ({ service, orgId }) => invalidateOrgDeckCaches(service, orgId),
 *   });
 *
 * Everything returned takes the service-role client explicitly: the package
 * never constructs one, so each app keeps its own Supabase wiring and its own
 * authorization gate in front of every call.
 */
import type { BasePlan } from "../catalog.js";
import type { BillingAccount } from "../types.js";
import type { MeterBalance } from "../usage.js";
import { type SetPlanResult } from "./comp.js";
import { type GrantInput, type UsageInput } from "./ledger.js";
import type { BillingProvider } from "./provider.js";
import { type BillingConfig, type Runtime, type Service } from "./runtime.js";
import { type SubscriptionPatch } from "./store.js";
import { type StripeHandle } from "./stripe/client.js";
import type { Subscription } from "../types.js";
export interface Billing<P extends string, T extends BasePlan<P>> {
    readonly runtime: Runtime<P, T>;
    readonly catalog: Runtime<P, T>["catalog"];
    /** The active provider: Stripe when `BILLING_PROVIDER=stripe`, else the mock. */
    provider(): BillingProvider<P>;
    /** Lazily configured Stripe client + config. Throws listing every missing env var. */
    readonly stripe: StripeHandle<P>;
    /** The org's subscription, created (free) on first touch, rolled forward
     *  when a free/comped period has lapsed. */
    subscription(service: Service, orgId: string): Promise<Subscription<P>>;
    /** Low-level write. Providers and comps use it; app code should rarely need to. */
    saveSubscription(service: Service, orgId: string, patch: SubscriptionPatch<P>): Promise<Subscription<P>>;
    /** Subscription, invoices, cards, billing profile, member count, owner email. */
    account(service: Service, orgId: string): Promise<BillingAccount<P>>;
    logEvent(service: Service, orgId: string, kind: string, actorEmail: string | null, payload?: Record<string, unknown>): Promise<void>;
    /** An operator moving a tier by hand. Refuses a live Stripe subscription. */
    setPlanByAdmin(service: Service, input: {
        orgId: string;
        plan: P;
        actorEmail: string | null;
    }): Promise<SetPlanResult<P>>;
    /** Usage ledger. */
    balance(service: Service, orgId: string, meter: string): Promise<MeterBalance>;
    assertCanAfford(service: Service, orgId: string, meter: string, price: number, describe?: (balance: MeterBalance) => string): Promise<MeterBalance>;
    recordUsage(service: Service, input: UsageInput): Promise<void>;
    grantCredit(service: Service, input: GrantInput): Promise<void>;
    /** The Stripe webhook as a Fetch handler. `getService` returns the
     *  service-role client (null → 500, so Stripe retries). */
    handleStripeWebhook(req: Request, getService: () => Service | null): Promise<Response>;
}
export declare function createBilling<P extends string, T extends BasePlan<P>>(config: BillingConfig<P, T>): Billing<P, T>;
