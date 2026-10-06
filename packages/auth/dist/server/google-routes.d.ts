import { type AuthRouteOptions } from "./routes.js";
/**
 * Build the `GET` handler for `/auth/google`, where the Google button sends
 * the browser when the app passes `googleSignInPath: "/auth/google"` to
 * `LoginForm` / `useLoginFlow` / `useAuth`. It starts the round trip that
 * comes back to `/auth/google/callback` on this domain (see `google.ts`).
 *
 *   // app/auth/google/route.ts
 *   export const GET = createGoogleStart({ defaultNext: "/app" });
 *
 * With `GOOGLE_SIGNIN_CLIENT_ID` or `GOOGLE_SIGNIN_CLIENT_SECRET` unset it
 * runs Supabase's hosted flow instead (back through `/auth/callback`), so the
 * button can point here before the client exists without breaking sign-in.
 */
export declare function createGoogleStart({ defaultNext, loginPath }: Omit<AuthRouteOptions, "onSignedIn">): (request: Request) => Promise<Response>;
/**
 * Build the `GET` handler for `/auth/google/callback`. Checks `state` against
 * the flow cookie, trades the code for Google's ID token (with the PKCE
 * verifier), and signs in with `signInWithIdToken`, which sets the same
 * session cookies `/auth/callback` would. Then on to `next`.
 *
 *   // app/auth/google/callback/route.ts
 *   export const GET = createGoogleCallback({ defaultNext: "/app", onSignedIn });
 *
 * Google accounts map to the same Supabase users as the hosted flow: both key
 * the identity on Google's `sub`, which is one per Google account whichever
 * OAuth client asked. Supabase only accepts the token if its audience (the
 * client ID) is listed under the project's Google provider.
 *
 * Failures go back to the sign-in page with a short `reason`, details in the log:
 *
 *   provider  Google reported an error other than a cancel
 *   state     no flow cookie, or its state isn't the one on the URL (CSRF, or
 *             a callback opened in a different browser / after ten minutes)
 *   nocode    neither a code nor an error came back
 *   config    the client ID or secret went missing mid-flow
 *   exchange  Google refused the code (expired, reused, wrong redirect URI)
 *   session   Supabase refused the ID token (most often: client ID not listed)
 *
 * Cancelling on Google's screen isn't a failure: back to the form, no error.
 */
export declare function createGoogleCallback({ defaultNext, loginPath, onSignedIn }: AuthRouteOptions): (request: Request) => Promise<Response>;
