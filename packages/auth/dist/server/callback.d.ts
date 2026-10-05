import { type AuthRouteOptions } from "./routes.js";
/**
 * Build the `GET` handler for `/auth/callback`, the OAuth / magic-link landing
 * point. Supabase redirects here with a one-time `code`; it is exchanged for a
 * cookie session and the browser goes on to `next`.
 *
 *   // app/auth/callback/route.ts
 *   export const GET = createAuthCallback({ defaultNext: "/decks" });
 *
 * Failures are logged with the underlying cause (Vercel function logs) and sent
 * back to the sign-in page with a short `reason`, so a provider error can be
 * told apart from a PKCE exchange failure:
 *
 *   provider  the provider or Supabase reported an error on the URL
 *   nocode    neither a code nor an error came back (a redirect-URL misconfiguration)
 *   exchange  exchangeCodeForSession failed, most often a missing PKCE verifier
 *             cookie because the flow started on a different origin
 */
export declare function createAuthCallback({ defaultNext, loginPath, onSignedIn }: AuthRouteOptions): (request: Request) => Promise<Response>;
