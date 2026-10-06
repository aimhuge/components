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
export declare const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export declare const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
/** Where the Google button sends the browser (`createGoogleStart`). */
export declare const GOOGLE_START_PATH = "/auth/google";
/** Where Google sends it back (`createGoogleCallback`). Registered on the client. */
export declare const GOOGLE_CALLBACK_PATH = "/auth/google/callback";
/** Plain sign-in: who the person is, nothing else. All three are non-sensitive. */
export declare const GOOGLE_SIGNIN_SCOPES = "openid email profile";
export declare const GOOGLE_FLOW_COOKIE = "aimhuge_google_signin";
export type GoogleSignInConfig = {
    clientId: string;
    clientSecret: string;
};
/** Both halves of the OAuth client, or null when either is unset. */
export declare function googleSignInConfig(): GoogleSignInConfig | null;
/**
 * The origin the browser actually used. Behind Vercel a route handler's
 * `request.url` can carry the deployment hostname, and Google compares
 * `redirect_uri` byte for byte with what's registered, so the forwarded host
 * wins. Locally there is none and `request.url` is right.
 */
export declare function requestOrigin(request: Request): string;
export declare const googleRedirectUri: (origin: string) => string;
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
export type GoogleFlow = {
    state: string;
    verifier: string;
    next: string;
};
export declare function newGoogleFlow(next: string): GoogleFlow;
export declare function codeChallenge(verifier: string): string;
export declare function encodeFlow(flow: GoogleFlow): string;
/** The flow `encodeFlow` wrote, or null for anything else. */
export declare function decodeFlow(raw: string | null): GoogleFlow | null;
/** One cookie's value off the request, or null. */
export declare function readCookie(request: Request, name: string): string | null;
/** Constant-time comparison. An empty `state` never matches. */
export declare function stateMatches(fromUrl: string, fromCookie: string): boolean;
export declare function flowCookieOptions(origin: string): {
    httpOnly: boolean;
    sameSite: "lax";
    secure: boolean;
    path: string;
    maxAge: number;
};
export declare function googleAuthorizeUrl(clientId: string, origin: string, flow: GoogleFlow): string;
export type GoogleTokens = {
    idToken: string;
    /** Passed to Supabase too: Google's ID token carries an `at_hash` of it. */
    accessToken: string | null;
};
/**
 * Trade the callback's code for Google's tokens. Throws with Google's error
 * code and description, never the code, the secret or a token.
 */
export declare function exchangeGoogleCode(config: GoogleSignInConfig, code: string, origin: string, verifier: string): Promise<GoogleTokens>;
