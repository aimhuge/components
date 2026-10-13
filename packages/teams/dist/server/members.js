/** Ordered list — index 0 is "most senior". Mirrors ROLE_RANK in
 *  ./permissions.ts; kept here too because role ordering on its own (without
 *  the permission table) is what `<select>` options iterate over. */
export const ORG_ROLES = ["owner", "admin", "member"];
/** All orgs a user belongs to (with their role), oldest membership first. */
export async function listUserOrgs(service, userId) {
    const { data } = await service
        .from("org_memberships")
        .select("role, orgs(id, slug, name)")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });
    return (data ?? [])
        .map((r) => {
        const org = Array.isArray(r.orgs) ? r.orgs[0] : r.orgs;
        return org ? { org, role: r.role } : null;
    })
        .filter((r) => r !== null);
}
/** Point a user's active-workspace at `orgId`. */
export async function setCurrentOrg(service, userId, orgId) {
    await service.from("profiles").update({ current_org_id: orgId }).eq("id", userId);
}
/** Everyone who belongs to `orgId`, oldest membership first. Service-role
 *  only — `org_memberships` RLS is enabled with no policies, so the only way
 *  to read it through the typed client is via the service client. */
export async function listOrgMembers(service, orgId) {
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
    if (rows.length === 0)
        return [];
    const userIds = rows.map((r) => r.user_id);
    const { data: profiles } = await service
        .from("profiles")
        .select("id, email, display_name, last_login_at")
        .in("id", userIds);
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    return rows.map((r) => {
        const p = byId.get(r.user_id);
        return {
            user_id: r.user_id,
            role: r.role,
            created_at: r.created_at,
            email: p?.email ?? null,
            display_name: p?.display_name ?? null,
            last_login_at: p?.last_login_at ?? null,
        };
    });
}
