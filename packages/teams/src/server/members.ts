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
export const ORG_ROLES: readonly OrgRole[] = ["owner", "admin", "member"] as const;

export interface Org {
  id: string;
  slug: string;
  name: string;
}

interface MembershipRow {
  role: OrgRole;
  orgs: Org | Org[] | null;
}

/** All orgs a user belongs to (with their role), oldest membership first. */
export async function listUserOrgs(
  service: SupabaseClient,
  userId: string,
): Promise<{ org: Org; role: OrgRole }[]> {
  const { data } = await service
    .from("org_memberships")
    .select("role, orgs(id, slug, name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  return ((data ?? []) as MembershipRow[])
    .map((r) => {
      const org = Array.isArray(r.orgs) ? r.orgs[0] : r.orgs;
      return org ? { org, role: r.role } : null;
    })
    .filter((r): r is { org: Org; role: OrgRole } => r !== null);
}

/** Point a user's active-workspace at `orgId`. */
export async function setCurrentOrg(
  service: SupabaseClient,
  userId: string,
  orgId: string,
): Promise<void> {
  await service.from("profiles").update({ current_org_id: orgId }).eq("id", userId);
}

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
export async function listOrgMembers(
  service: SupabaseClient,
  orgId: string,
): Promise<OrgMember[]> {
  // Supabase JS can't join profiles via a foreign key that doesn't exist (the
  // relationship on org_memberships.user_id → auth.users is implicit), so we
  // read memberships + profiles separately and stitch in app code. The team
  // page is not a hot path; the second query is fine.
  const { data: memberships } = await service
    .from("org_memberships")
    .select("user_id, role, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });

  const rows = memberships ?? [];
  if (rows.length === 0) return [];

  const userIds = rows.map((r) => r.user_id as string);
  const { data: profiles } = await service
    .from("profiles")
    .select("id, email, display_name, last_login_at")
    .in("id", userIds);
  const byId = new Map((profiles ?? []).map((p) => [p.id as string, p]));

  return rows.map((r) => {
    const p = byId.get(r.user_id as string);
    return {
      user_id: r.user_id as string,
      role: r.role as OrgRole,
      created_at: r.created_at as string,
      email: (p?.email as string | null) ?? null,
      display_name: (p?.display_name as string | null) ?? null,
      last_login_at: (p?.last_login_at as string | null) ?? null,
    };
  });
}