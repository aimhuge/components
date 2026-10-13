/**
 * Org membership primitives — the shapes and the two reads every org module
 * shares. Split out so the gate (gate.ts) and the workspace resolvers (orgs.ts)
 * can both import them without importing each other.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
export type OrgRole = "owner" | "admin" | "member";
/** Ordered list — index 0 is "most senior". Mirrors ROLE_RANK in
 *  ./permissions.ts; kept here too because role ordering on its own (without
 *  the permission table) is what `<select>` options iterate over. */
export declare const ORG_ROLES: readonly OrgRole[];
export interface Org {
    id: string;
    slug: string;
    name: string;
}
/** All orgs a user belongs to (with their role), oldest membership first. */
export declare function listUserOrgs(service: SupabaseClient, userId: string): Promise<{
    org: Org;
    role: OrgRole;
}[]>;
/** Point a user's active-workspace at `orgId`. */
export declare function setCurrentOrg(service: SupabaseClient, userId: string, orgId: string): Promise<void>;
/** A member of a workspace, with their profile fields merged in. `email` /
 *  `display_name` / `last_login_at` come from `public.profiles` — null when
 *  the row is missing or hasn't been populated. The team roster renders an em
 *  dash in those cases. */
export interface OrgMember {
    user_id: string;
    role: OrgRole;
    created_at: string;
    email: string | null;
    display_name: string | null;
    last_login_at: string | null;
}
/** Everyone who belongs to `orgId`, oldest membership first. Service-role
 *  only — `org_memberships` RLS is enabled with no policies, so the only way
 *  to read it through the typed client is via the service client. */
export declare function listOrgMembers(service: SupabaseClient, orgId: string): Promise<OrgMember[]>;
