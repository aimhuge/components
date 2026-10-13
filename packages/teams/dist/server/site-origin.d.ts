/**
 * The origin every link handed to an agent or a platform is built on.
 * One helper so review links, connect links, and generated card images
 * can't disagree about where the app lives.
 *
 * Apps pass the env-derived fallback in (e.g. `process.env.NEXT_PUBLIC_SITE_URL`
 * or `"https://blastcp.com"`). Tests pass a fixed string.
 */
export declare function siteOrigin(fallback?: string): string;
