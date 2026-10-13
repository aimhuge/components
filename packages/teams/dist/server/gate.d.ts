import type { SupabaseClient } from "@supabase/supabase-js";
import { type Org, type OrgRole } from "./members";
/** Apps must provide a service-role Supabase client and a cookie-bound
 *  Supabase SSR client. They are passed in so this package has no opinion
 *  about app config (env, build-time secrets, etc.). */
export interface TeamClients {
    service: SupabaseClient;
    ssr: SupabaseClient;
}
export interface OrgContext {
    userId: string;
    email: string | null;
    org: Org;
    role: OrgRole;
    /** Every org the user belongs to — powers the switcher. */
    orgs: Org[];
    /**
     * True when the caller is a platform super-admin viewing this org WITHOUT a
     * membership row (the god-view bypass). Members — including super-admins
     * who happen to belong to the org — are false. Drives admin-only
     * affordances.
     */
    isSuperAdmin: boolean;
    service: SupabaseClient;
}
export declare const orgAccessTag: (orgId: string) => string;
export declare const userAccessTag: (userId: string) => string;
/**
 * A membership changed — someone added, removed, re-roled — or the org itself
 * was renamed. Every cached verdict touching that org or that user is wrong
 * NOW, so this is a hard expire, not stale-while-revalidate: a removed member
 * must not get one more stale "ok" on their way out. Server Actions and Route
 * Handlers only (Next refuses tag writes during a render).
 */
export declare function invalidateOrgAccess(opts: {
    orgId?: string;
    userId?: string;
}): void;
/** Who is asking. Cached per browser, never on the server. */
export interface SessionClaims {
    sub: string;
    email: string | null;
}
export declare function sessionClaims(clients: TeamClients): Promise<SessionClaims | null>;
/**
 * The gate for every `/[orgSlug]/…` route. Redirects to login when signed
 * out, 404s when the org doesn't exist OR the user isn't a member (same
 * response, so membership can't be probed). Returns everything a route
 * needs.
 */
export declare function requireOrg(clients: TeamClients, orgSlug: string, returnPath?: string): Promise<OrgContext>;
