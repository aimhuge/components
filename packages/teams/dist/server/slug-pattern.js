/**
 * Segments that can never be an org slug, so `/:orgSlug/...` rewrite and
 * redirect patterns don't swallow real root routes.
 *
 * `$` in path-to-regexp anchors to the end of the PATH, not the segment, so
 * `api$` would NOT exclude `/api/decks/x`. The trailing slash in each
 * alternative is what makes this a whole-segment match: an org genuinely named
 * "apiary" is unaffected.
 */
export const ORG_SLUG_PATTERN = "((?!(?:api|decks|clients|internal|dashboard|_next)/)[^/]+)";
/**
 * Whether a slug is safe to interpolate into a redirect PATH like
 * `/${slug}/leads`. OAuth flows carry the slug through `state` or a query
 * param, which is to say from the URL bar, and `new URL("/" + slug, origin)`
 * turns `/evil.example` — or `\\evil.example`, since the URL parser reads a
 * backslash as a slash for https — into a protocol-relative redirect OFF-SITE.
 */
export function isSafeOrgSlug(slug) {
    return /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(slug);
}
