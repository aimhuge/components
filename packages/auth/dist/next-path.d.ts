/**
 * Same-origin sanitizer for a `?next=` value. It rides on every sign-in link,
 * so an attacker controls it, and an off-site value would make the login flow
 * an open redirect.
 *
 * A plain `startsWith("/") && !startsWith("//")` check is NOT enough:
 * browsers parse `/\evil.com` (and `/<tab>/evil.com`) as `//evil.com`, which
 * is a full URL in disguise. So the value is resolved the way a browser would
 * resolve it, and only kept if it stays on the origin it started on. What
 * comes back is the normalised path + query + hash, never a URL.
 */
export declare function safeNextPath(raw: string | readonly string[] | null | undefined, fallback: string): string;
