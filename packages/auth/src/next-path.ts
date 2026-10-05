/** Any origin works here; it only has to be one no real `next` can name. */
const PROBE_ORIGIN = "http://next-path.invalid";

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
export function safeNextPath(raw: string | readonly string[] | null | undefined, fallback: string): string {
  const value = typeof raw === "string" ? raw : raw?.[0];
  if (typeof value !== "string" || !value.startsWith("/")) return fallback;

  let url: URL;
  try {
    url = new URL(value, PROBE_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== PROBE_ORIGIN) return fallback;
  return url.pathname + url.search + url.hash;
}
