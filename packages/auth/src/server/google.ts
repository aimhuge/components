import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Google sign-in on the app's own domain: the wire pieces `google-routes.ts`
 * assembles into `/auth/google` and `/auth/google/callback`.
 *
 * Why it exists: Supabase's hosted Google flow sends Google back to
 * `<ref>.supabase.co/auth/v1/callback`, so that host has to be an authorized
 * domain on the Google Cloud project, and a project that also asks for
 * sensitive scopes (YouTube, Gmail) must own every authorized domain to get
 * them verified. Here Google returns to the app itself; the app trades the
 * code for Google's ID token and hands that to Supabase (`signInWithIdToken`).
 * Supabase never talks to Google, so `supabase.co` leaves the Google project.
 *
 * Server-only. Reads `GOOGLE_SIGNIN_CLIENT_ID` and `GOOGLE_SIGNIN_CLIENT_SECRET`.
 * No code, token or secret ever reaches a log line or an error message.
 */

export const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
/** Where the Google button sends the browser (`createGoogleStart`). */
export const GOOGLE_START_PATH = "/auth/google";
/** Where Google sends it back (`createGoogleCallback`). Registered on the client. */
export const GOOGLE_CALLBACK_PATH = "/auth/google/callback";
/** Plain sign-in: who the person is, nothing else. All three are non-sensitive. */
export const GOOGLE_SIGNIN_SCOPES = "openid email profile";
export const GOOGLE_FLOW_COOKIE = "aimhuge_google_signin";
/** Ten minutes to get through Google's account chooser. */
const FLOW_MAX_AGE_S = 10 * 60;
/** The exchange runs inside a person's redirect. */
const EXCHANGE_TIMEOUT_MS = 15_000;

export type GoogleSignInConfig = { clientId: string; clientSecret: string };

/** Both halves of the OAuth client, or null when either is unset. */
export function googleSignInConfig(): GoogleSignInConfig | null {
  const clientId = process.env.GOOGLE_SIGNIN_CLIENT_ID ?? "";
  const clientSecret = process.env.GOOGLE_SIGNIN_CLIENT_SECRET ?? "";
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/**
 * The origin the browser actually used. Behind Vercel a route handler's
 * `request.url` can carry the deployment hostname, and Google compares
 * `redirect_uri` byte for byte with what's registered, so the forwarded host
 * wins. Locally there is none and `request.url` is right.
 */
export function requestOrigin(request: Request): string {
  const host = request.headers.get("x-forwarded-host");
  if (host) return `${request.headers.get("x-forwarded-proto") ?? "https"}://${host}`;
  return new URL(request.url).origin;
}

export const googleRedirectUri = (origin: string) => `${origin}${GOOGLE_CALLBACK_PATH}`;

/**
 * One sign-in attempt. It rides an httpOnly cookie scoped to `/auth/google`,
 * never the URL: Google only ever sees `state` and the verifier's hash.
 *
 * - `state` binds the callback to the browser that started it (CSRF).
 * - `verifier` is PKCE: a code lifted from a URL or a log can't be redeemed
 *   by anyone else, because the exchange needs this value.
 * - `next` is already sanitized by the start route.
 *
 * No OIDC `nonce`: the ID token comes straight from Google's token endpoint to
 * this server, never through a browser, so there is nothing to replay into it.
 */
export type GoogleFlow = { state: string; verifier: string; next: string };

const random = (bytes: number) => randomBytes(bytes).toString("base64url");

export function newGoogleFlow(next: string): GoogleFlow {
  // 32 bytes is 43 base64url characters: the shortest verifier PKCE allows.
  return { state: random(24), verifier: random(32), next };
}

export function codeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function encodeFlow(flow: GoogleFlow): string {
  return Buffer.from(JSON.stringify(flow)).toString("base64url");
}

/** The flow `encodeFlow` wrote, or null for anything else. */
export function decodeFlow(raw: string | null): GoogleFlow | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    const { state, verifier, next } = parsed as Record<string, unknown>;
    if (typeof state !== "string" || state.length < 16) return null;
    if (typeof verifier !== "string" || verifier.length < 43) return null;
    if (typeof next !== "string") return null;
    return { state, verifier, next };
  } catch {
    return null;
  }
}

/** One cookie's value off the request, or null. */
export function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

/** Constant-time comparison. An empty `state` never matches. */
export function stateMatches(fromUrl: string, fromCookie: string): boolean {
  const a = Buffer.from(fromUrl);
  const b = Buffer.from(fromCookie);
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

export function flowCookieOptions(origin: string) {
  return {
    httpOnly: true,
    // Lax still rides Google's top-level redirect back to the callback.
    sameSite: "lax" as const,
    secure: origin.startsWith("https:"),
    // Covers the start route and the callback, and no other request.
    path: GOOGLE_START_PATH,
    maxAge: FLOW_MAX_AGE_S,
  };
}

export function googleAuthorizeUrl(clientId: string, origin: string, flow: GoogleFlow): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleRedirectUri(origin),
    response_type: "code",
    scope: GOOGLE_SIGNIN_SCOPES,
    state: flow.state,
    code_challenge: codeChallenge(flow.verifier),
    code_challenge_method: "S256",
  });
  // A space as "%20", not "+": "+" is only a space to a form decoder.
  return `${GOOGLE_AUTHORIZE_URL}?${params.toString().replace(/\+/g, "%20")}`;
}

export type GoogleTokens = {
  idToken: string;
  /** Passed to Supabase too: Google's ID token carries an `at_hash` of it. */
  accessToken: string | null;
};

/**
 * Trade the callback's code for Google's tokens. Throws with Google's error
 * code and description, never the code, the secret or a token.
 */
export async function exchangeGoogleCode(
  config: GoogleSignInConfig,
  code: string,
  origin: string,
  verifier: string,
): Promise<GoogleTokens> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: googleRedirectUri(origin),
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(EXCHANGE_TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const idToken = typeof json.id_token === "string" ? json.id_token : "";
  if (!res.ok || !idToken) {
    const reason = typeof json.error === "string" ? json.error : "no id_token returned";
    const desc = typeof json.error_description === "string" ? `: ${json.error_description.slice(0, 200)}` : "";
    throw new Error(`Google token exchange failed (${res.status}) ${reason}${desc}`);
  }
  return { idToken, accessToken: typeof json.access_token === "string" ? json.access_token : null };
}
