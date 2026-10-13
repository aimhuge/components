/**
 * One canonical form for an email address.
 *
 * Lowercased and trimmed. Deliberately does NOT strip Gmail dots or +tags:
 * those are different addresses as far as every table here is concerned, and
 * silently widening a match would erase data belonging to someone who didn't
 * ask.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Cheap sanity check — enough to catch a typo'd or empty operator input before
 *  it becomes a destructive query, not an attempt at RFC 5322. */
export function isPlausibleEmail(raw: string): boolean {
  const e = normalizeEmail(raw);
  return e.length >= 3 && e.includes("@") && !e.includes(" ") && !e.startsWith("@") && !e.endsWith("@");
}

/**
 * Escape the wildcards in a value about to be used as a LIKE/`ilike` pattern.
 *
 * `_` and `%` are both legal in an address local part and both are wildcards to
 * Postgres, so an unescaped `ilike` is a WIDER match than `eq`, not merely a
 * case-insensitive one.
 */
export function escapeLikeWildcards(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}