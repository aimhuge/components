import { NextResponse } from "next/server.js";
import { safeNextPath } from "../next-path.js";
import { getSupabaseServer } from "./supabase-server.js";
import { failRedirect, runOnSignedIn } from "./routes.js";
import { GOOGLE_FLOW_COOKIE, decodeFlow, encodeFlow, exchangeGoogleCode, flowCookieOptions, googleAuthorizeUrl, googleSignInConfig, newGoogleFlow, readCookie, requestOrigin, stateMatches, } from "./google.js";
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
export function createGoogleStart({ defaultNext, loginPath = "/login" }) {
    return async function GET(request) {
        const origin = requestOrigin(request);
        const next = safeNextPath(new URL(request.url).searchParams.get("next"), defaultNext);
        const config = googleSignInConfig();
        if (!config)
            return hostedFlow(origin, next, loginPath);
        const flow = newGoogleFlow(next);
        const res = NextResponse.redirect(googleAuthorizeUrl(config.clientId, origin, flow));
        res.cookies.set(GOOGLE_FLOW_COOKIE, encodeFlow(flow), flowCookieOptions(origin));
        return res;
    };
}
/** Supabase's own flow, started server-side. supabase-ssr writes its PKCE
 *  verifier cookie through `cookies()`, which this redirect carries. */
async function hostedFlow(origin, next, loginPath) {
    const supabase = await getSupabaseServer();
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`, skipBrowserRedirect: true },
    });
    if (error || !data.url) {
        console.error("[auth/google] hosted flow refused:", error?.message ?? "no authorize URL");
        return NextResponse.redirect(failRedirect(origin, loginPath, "provider"));
    }
    return NextResponse.redirect(data.url);
}
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
export function createGoogleCallback({ defaultNext, loginPath = "/login", onSignedIn }) {
    return async function GET(request) {
        const params = new URL(request.url).searchParams;
        const origin = requestOrigin(request);
        const flow = decodeFlow(readCookie(request, GOOGLE_FLOW_COOKIE));
        const next = safeNextPath(flow?.next, defaultNext);
        // The flow is single-use whatever happens next, so every exit clears it.
        const go = (dest) => {
            const res = NextResponse.redirect(dest);
            res.cookies.set(GOOGLE_FLOW_COOKIE, "", { ...flowCookieOptions(origin), maxAge: 0 });
            return res;
        };
        const fail = (reason) => go(failRedirect(origin, loginPath, reason));
        const providerError = params.get("error");
        if (providerError === "access_denied") {
            const back = new URL(loginPath, origin);
            back.searchParams.set("next", next);
            return go(back);
        }
        if (providerError) {
            console.error("[auth/google] provider error:", providerError);
            return fail("provider");
        }
        if (!flow || !stateMatches(params.get("state") ?? "", flow.state)) {
            console.error(`[auth/google] state check failed (flow cookie ${flow ? "present, state differs" : "absent"})`);
            return fail("state");
        }
        const code = params.get("code");
        if (!code) {
            console.error("[auth/google] no code and no error on the callback URL");
            return fail("nocode");
        }
        const config = googleSignInConfig();
        if (!config) {
            console.error("[auth/google] GOOGLE_SIGNIN_CLIENT_ID or GOOGLE_SIGNIN_CLIENT_SECRET is unset");
            return fail("config");
        }
        let tokens;
        try {
            tokens = await exchangeGoogleCode(config, code, origin, flow.verifier);
        }
        catch (e) {
            console.error("[auth/google]", e instanceof Error ? e.message : String(e));
            return fail("exchange");
        }
        const supabase = await getSupabaseServer();
        const { error } = await supabase.auth.signInWithIdToken({
            provider: "google",
            token: tokens.idToken,
            ...(tokens.accessToken ? { access_token: tokens.accessToken } : {}),
        });
        if (error) {
            console.error("[auth/google] signInWithIdToken failed:", {
                message: error.message,
                status: error.status,
                code: error.code,
            });
            return fail("session");
        }
        await runOnSignedIn("auth/google", request, supabase, onSignedIn);
        return go(new URL(next, origin));
    };
}
