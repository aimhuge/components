import { NextResponse } from "next/server.js";
import { safeNextPath } from "../next-path.js";
import { getSupabaseServer } from "./supabase-server.js";
import { failRedirect, runOnSignedIn, type AuthRouteOptions } from "./routes.js";

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
export function createAuthCallback({ defaultNext, loginPath = "/login", onSignedIn }: AuthRouteOptions) {
  return async function GET(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const next = safeNextPath(url.searchParams.get("next"), defaultNext);

    const fail = (reason: string) => NextResponse.redirect(failRedirect(url.origin, loginPath, reason));

    // `link=1` means the browser tried to LINK a provider onto an anonymous
    // account (a guest keeping what they made before signing in) rather than
    // sign in. That fails when the provider account already belongs to another
    // user, and it fails here, after the round trip. The recovery is to sign
    // in plainly, so send them back with `signin=force`, which the form obeys.
    // Without it they would bounce between "link" and "that link expired"
    // forever, because retrying re-attempts the link.
    const wasLinking = url.searchParams.get("link") === "1";
    const retryAsSignIn = (why: string) => {
      console.warn("[auth/callback] identity link refused, falling back to sign-in:", why);
      const dest = new URL(loginPath, url.origin);
      dest.searchParams.set("next", next);
      dest.searchParams.set("signin", "force");
      dest.searchParams.set("relink", "conflict");
      return NextResponse.redirect(dest);
    };

    // Provider- or Supabase-side error: no code, just error params on the URL.
    const providerError = url.searchParams.get("error");
    if (providerError) {
      const desc = url.searchParams.get("error_description") ?? "";
      const errCode = url.searchParams.get("error_code") ?? "";
      console.error("[auth/callback] provider error:", { providerError, errCode, desc });
      return wasLinking ? retryAsSignIn(errCode || providerError) : fail("provider");
    }

    if (!code) {
      console.error("[auth/callback] no code and no error param on callback URL");
      // Some GoTrue versions report a refused link in the URL FRAGMENT, which a
      // server never sees, so a linking round trip that comes back with neither
      // a code nor an error is the same failure wearing a different hat.
      return wasLinking ? retryAsSignIn("no code on a link callback") : fail("nocode");
    }

    const supabase = await getSupabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await runOnSignedIn("auth/callback", request, supabase, onSignedIn);
      return NextResponse.redirect(new URL(next, url.origin));
    }

    console.error("[auth/callback] exchangeCodeForSession failed:", {
      message: error.message,
      status: error.status,
      code: error.code,
    });
    return fail("exchange");
  };
}
