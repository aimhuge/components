/**
 * The gate for the `/[orgSlug]/…` route tree.
 *
 * `requireOrg(slug)` resolves the signed-in user, confirms membership, and
 * returns the org + role + the user's full org list + a service client for
 * the actual data work. Because it re-derives the org from the URL slug and
 * verifies membership, the URL is a safe source of truth.
 *
 * - **Who** comes from `getClaims()`: the project signs tokens with ES256, so
 *   the JWT is verified locally against the project's JWKS (fetched once,
 *   cached by auth-js) — no `/auth/v1/user` call. The proxy already refreshed
 *   the session for this request, so the token in the cookie is current.
 * - **Whether they may** comes from `resolveMembership`, a plain `"use cache"`
 *   keyed on (org slug, user) that lingers for `GATE_STALE_S`. Nothing from
 *   cookies goes in — the user id is extracted first and passed as an
 *   argument, the documented "extract and pass" shape. Membership writes
 *   hard-expire it (`invalidateOrgAccess`), so a revoked member is out on
 *   their next request, not ten minutes later.
 *
 * The auth read sits in `sessionClaims`, a `"use cache: private"` scope: the
 * one cache scope allowed to read cookies, stored only in the browser, and
 * the documented home for an auth helper that consults the clock where
 * nothing can be hoisted out (auth-js compares the token's expiry to
 * `Date.now()` inside `getClaims`).
 */
import { notFound, redirect } from "next/navigation";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import { isSuperAdmin } from "./super-admin-emails";
import { listUserOrgs } from "./members";
/** How long a membership verdict may be reused before it is re-derived. The
 *  bound only matters for changes that DON'T go through `invalidateOrgAccess`
 *  (a direct DB edit); everything in the app busts explicitly. */
const GATE_STALE_S = 10 * 60;
export const orgAccessTag = (orgId) => `org-access:${orgId}`;
export const userAccessTag = (userId) => `user-access:${userId}`;
/**
 * A membership changed — someone added, removed, re-roled — or the org itself
 * was renamed. Every cached verdict touching that org or that user is wrong
 * NOW, so this is a hard expire, not stale-while-revalidate: a removed member
 * must not get one more stale "ok" on their way out. Server Actions and Route
 * Handlers only (Next refuses tag writes during a render).
 */
export function invalidateOrgAccess(opts) {
    if (opts.orgId)
        revalidateTag(orgAccessTag(opts.orgId), { expire: 0 });
    if (opts.userId)
        revalidateTag(userAccessTag(opts.userId), { expire: 0 });
}
async function resolveMembership(clients, orgSlug, userId, email) {
    "use cache";
    cacheLife({ stale: GATE_STALE_S, revalidate: GATE_STALE_S, expire: 6 * 60 * 60 });
    cacheTag(userAccessTag(userId));
    const { service } = clients;
    if (!service)
        throw new Error("Supabase service client not configured");
    const { data: org } = await service
        .from("orgs")
        .select("id, slug, name")
        .eq("slug", orgSlug)
        .maybeSingle();
    if (!org)
        return { kind: "denied" };
    cacheTag(orgAccessTag(org.id));
    const { data: membership } = await service
        .from("org_memberships")
        .select("role")
        .eq("org_id", org.id)
        .eq("user_id", userId)
        .maybeSingle();
    // God-view bypass: a platform super-admin can open ANY org and see it
    // exactly as that org does, even without a membership row. Non-super-admin
    // non-members still 404 (indistinguishable from "org doesn't exist", so
    // membership can't be probed). A super-admin who IS a member falls
    // through as a normal member.
    const superAdmin = !membership && isSuperAdmin(email);
    if (!membership && !superAdmin)
        return { kind: "denied" };
    const memberships = await listUserOrgs(service, userId);
    return {
        kind: "ok",
        org: org,
        role: (membership?.role ?? "owner"),
        orgs: memberships.map((m) => m.org),
        isSuperAdmin: superAdmin,
    };
}
export async function sessionClaims(clients) {
    "use cache: private";
    cacheLife({ stale: GATE_STALE_S, revalidate: GATE_STALE_S, expire: 6 * 60 * 60 });
    const { ssr } = clients;
    const { data, error: authError } = await ssr.auth.getClaims();
    if (authError) {
        // An unreachable auth server (the JWKS fetch, or a refresh) also yields
        // no claims. Falling through would sign the visitor out of a session
        // they still have.
        const msg = String(authError.message ?? "").toLowerCase();
        if (msg.includes("fetch") || msg.includes("network") || msg.includes("unreachable")) {
            throw new Error("auth_backend_unreachable");
        }
        return null;
    }
    const claims = data?.claims;
    if (!claims?.sub)
        return null;
    return { sub: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
}
/**
 * The gate for every `/[orgSlug]/…` route. Redirects to login when signed
 * out, 404s when the org doesn't exist OR the user isn't a member (same
 * response, so membership can't be probed). Returns everything a route
 * needs.
 */
export async function requireOrg(clients, orgSlug, returnPath) {
    const session = await sessionClaims(clients);
    if (!session) {
        // Forward the originally-requested path so the SignedInPrompt's Continue
        // button (and the post-login redirect) brings the visitor back to the
        // page they were actually trying to reach, instead of bouncing to `/`.
        //
        // Same-origin sanitize: a caller-supplied `returnPath` is no riskier
        // than the visitor typing a URL into the address bar, but a value
        // beginning with `//` is an open redirect — strip it the same way
        // /auth/callback and /login do. When no path is supplied (the common
        // case from page/action call sites) fall back to `/${orgSlug}` so
        // Continue at least lands on the workspace home rather than the
        // marketing homepage.
        const next = returnPath && returnPath.startsWith("/") && !returnPath.startsWith("//")
            ? returnPath
            : `/${orgSlug}`;
        redirect(`/login?next=${encodeURIComponent(next)}`);
    }
    const { sub, email } = session;
    const access = await resolveMembership(clients, orgSlug, sub, email);
    if (access.kind === "denied")
        notFound();
    return {
        userId: sub,
        email,
        org: access.org,
        role: access.role,
        orgs: access.orgs,
        isSuperAdmin: access.isSuperAdmin,
        service: clients.service,
    };
}
