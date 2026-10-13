import { isReservedSlug, slugify } from "./slugs";
import { listUserOrgs, setCurrentOrg } from "./members";
/**
 * First free, non-reserved org slug for `nameSeed`. Exported so a flow can
 * SHOW the URL an org is about to get (the admin hand-off preview) before
 * committing to it. Advisory, not a reservation: nothing holds the slug, so
 * `createOrg` re-runs it rather than trusting a value computed earlier.
 */
export async function reserveOrgSlug(service, nameSeed) {
    const base = slugify(nameSeed);
    let slug = base;
    let n = 1;
    // Collision- and reserved-word-safe: bump a numeric suffix until free.
    // Bounded to keep a pathological loop from running away.
    for (let attempt = 0; attempt < 50; attempt++) {
        if (!isReservedSlug(slug)) {
            const { data: existing } = await service
                .from("orgs")
                .select("id")
                .eq("slug", slug)
                .maybeSingle();
            if (!existing)
                break;
        }
        n += 1;
        slug = `${base}-${n}`;
    }
    return slug;
}
/** Create an org with a unique, non-reserved slug and seed the creator as
 *  owner.
 *
 *  `reserveOrgSlug` READS before we write, so two orgs created in the same
 *  instant can both be told the same slug is free. `orgs.slug` is UNIQUE,
 *  which turns that race into a 23505 rather than a duplicate — we
 *  recompute and retry, because the caller may already have created an
 *  account by this point and failing here would strand it. */
export async function createOrg(service, ownerId, nameSeed) {
    const name = nameSeed.trim() || "Workspace";
    let lastError = "Failed to create org";
    for (let attempt = 0; attempt < 5; attempt++) {
        const slug = await reserveOrgSlug(service, nameSeed);
        const { data: org, error } = await service
            .from("orgs")
            .insert({ slug, name })
            .select("id, slug, name")
            .single();
        if (org) {
            await service
                .from("org_memberships")
                .insert({ org_id: org.id, user_id: ownerId, role: "owner" });
            return org;
        }
        lastError = error?.message ?? lastError;
        // Anything but a slug collision means retrying can't help.
        if (error?.code !== "23505")
            break;
    }
    throw new Error(lastError);
}
/**
 * The org a user is "in" right now: their `profiles.current_org_id` when
 * that pointer still names a workspace they belong to, else their oldest
 * membership. `pointed` says which of the two it was, so a caller that's
 * allowed to write can heal a stale pointer. Null when they belong to
 * nothing yet.
 */
async function pickCurrentOrg(service, userId) {
    const memberships = await listUserOrgs(service, userId);
    if (memberships.length === 0)
        return null;
    const { data: prof } = await service
        .from("profiles")
        .select("current_org_id")
        .eq("id", userId)
        .maybeSingle();
    const current = memberships.find((m) => m.org.id === prof?.current_org_id);
    const fallback = memberships[0];
    if (!fallback)
        return null;
    return { org: (current ?? fallback).org, pointed: !!current };
}
/**
 * The user's active org, READ-ONLY: no workspace is created and no pointer
 * is written. For chrome that merely wants to POINT at the workspace — the
 * god-view sidebar showing the admin their own menu — where creating an org
 * as a side effect of rendering a nav would be wrong. Null when they have
 * none.
 */
export async function currentOrgForUser(service, userId) {
    return (await pickCurrentOrg(service, userId))?.org ?? null;
}
/**
 * Resolve the slug of the user's active org, creating a personal workspace
 * on first use. Used by the `/app` entry redirect and anywhere we need to
 * land a user in "their" org without a slug in hand.
 *
 * `onFirstWorkspace` is called exactly once, when we just created the
 * user's first workspace. Apps use it to fire analytics, slack reports,
 * invite-ledger rows, etc.
 */
export async function ensureCurrentOrgSlug(service, userId, email, onFirstWorkspace) {
    const current = await pickCurrentOrg(service, userId);
    if (current) {
        if (!current.pointed)
            await setCurrentOrg(service, userId, current.org.id);
        return current.org.slug;
    }
    const seed = email?.split("@")?.[0] ?? "workspace";
    const org = await createOrg(service, userId, seed);
    // No memberships until now: this is a first-time user, i.e. a signup.
    if (onFirstWorkspace) {
        await onFirstWorkspace(org, userId, email);
    }
    await setCurrentOrg(service, userId, org.id);
    return org.slug;
}
