/**
 * Workspace slugs live at the URL root (`/acme/posts`), so they share the
 * namespace with real root routes. A slug in this set can never be claimed by
 * a workspace.
 *
 * Apps can extend this set by passing their own reserved-slug list to
 * `extendReservedSlugs()`. The set is mutable by design so apps can register
 * routes at install time, before the first workspace is created.
 */
export const RESERVED_SLUGS = new Set([
    // Standard reserved words common to AimHuge apps
    "api",
    "auth",
    "claim",
    "clients",
    "dashboard",
    "decks",
    "feedback",
    "internal",
    "leads",
    "login",
    "logout",
    "pricing",
    "settings",
    "signup",
    "skills",
    "support",
    "team",
    "teams",
    "tokens",
    "workspace",
    "workspaces",
    // Reserved for likely-future root routes / product surfaces
    "about",
    "account",
    "admin",
    "analytics",
    "app",
    "billing",
    "blog",
    "calendar",
    "channels",
    "contact",
    "docs",
    "help",
    "home",
    "i",
    "new",
    "o",
    "org",
    "orgs",
    "posts",
    "schedule",
    "status",
    "unsubscribe",
    // Infra / vanity subpaths
    "assets",
    "cdn",
    "mail",
    "public",
    "static",
    "www",
    // Next.js file-convention routes that resolve at the root
    "favicon.ico",
    "icon",
    "manifest.json",
    "opengraph-image",
    "robots.txt",
    "sitemap.xml",
]);
/** True if `slug` can't be used as a workspace slug (reserved word, or too
 *  short). */
export function isReservedSlug(slug) {
    const lower = slug.toLowerCase();
    return slug.length < 2 || RESERVED_SLUGS.has(lower);
}
/** Normalize arbitrary text into a URL-safe slug candidate. */
export function slugify(input) {
    return (input
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "workspace");
}
