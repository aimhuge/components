/**
 * Workspace slugs live at the URL root (`/acme/posts`), so they share the
 * namespace with real root routes. A slug in this set can never be claimed by
 * a workspace.
 *
 * Apps can extend this set by passing their own reserved-slug list to
 * `extendReservedSlugs()`. The set is mutable by design so apps can register
 * routes at install time, before the first workspace is created.
 */
export declare const RESERVED_SLUGS: Set<string>;
/** True if `slug` can't be used as a workspace slug (reserved word, or too
 *  short). */
export declare function isReservedSlug(slug: string): boolean;
/** Normalize arbitrary text into a URL-safe slug candidate. */
export declare function slugify(input: string): string;
