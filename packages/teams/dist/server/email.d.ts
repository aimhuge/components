/**
 * One canonical form for an email address.
 *
 * Lowercased and trimmed. Deliberately does NOT strip Gmail dots or +tags:
 * those are different addresses as far as every table here is concerned, and
 * silently widening a match would erase data belonging to someone who didn't
 * ask.
 */
export declare function normalizeEmail(raw: string): string;
/** Cheap sanity check — enough to catch a typo'd or empty operator input before
 *  it becomes a destructive query, not an attempt at RFC 5322. */
export declare function isPlausibleEmail(raw: string): boolean;
/**
 * Escape the wildcards in a value about to be used as a LIKE/`ilike` pattern.
 *
 * `_` and `%` are both legal in an address local part and both are wildcards to
 * Postgres, so an unescaped `ilike` is a WIDER match than `eq`, not merely a
 * case-insensitive one.
 */
export declare function escapeLikeWildcards(value: string): string;
