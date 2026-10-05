/**
 * An operator setting an org's tier by hand — a comp, a repair, a downgrade.
 *
 * The one sanctioned way to move a tier without a checkout: it goes through
 * `saveSubscription`, so the app's `onPlanChange` and any database mirror
 * follow exactly as they would for a purchase. Apps wrap it with their own
 * super-admin gate and anything they must ALWAYS refresh (DeckCP re-clears
 * its deck caches even when the tier didn't change).
 */
import type { BasePlan } from "../catalog.js";
import type { Runtime, Service } from "./runtime.js";
export interface SetPlanResult<P extends string> {
    from: P;
    to: P;
    changed: boolean;
}
export declare function setPlanByAdmin<P extends string, T extends BasePlan<P>>(rt: Runtime<P, T>, service: Service, input: {
    orgId: string;
    plan: P;
    actorEmail: string | null;
}): Promise<SetPlanResult<P>>;
