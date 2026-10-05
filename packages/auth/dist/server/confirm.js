import { NextResponse } from "next/server.js";
import { safeNextPath } from "../next-path.js";
import { getSupabaseServer } from "./supabase-server.js";
import { failRedirect, runOnSignedIn } from "./routes.js";
/**
 * Build the `GET` handler for `/auth/confirm`, the landing point for email
 * links (magic link, signup confirm, recovery, email change).
 *
 *   // app/auth/confirm/route.ts
 *   export const GET = createAuthConfirm({ defaultNext: "/decks" });
 *
 * Unlike OAuth, which uses the PKCE code flow in /auth/callback and needs the
 * code_verifier cookie the browser wrote when it started, an email link
 * carries a `token_hash` checked with `verifyOtp`. That needs NO verifier
 * cookie, so it survives the link being opened on another device or browser,
 * or being pre-fetched by an email security scanner — exactly the cases where
 * exchangeCodeForSession fails with `pkce_code_verifier_not_found`.
 *
 * Only used when the Supabase email templates point here with
 * `{{ .TokenHash }}` instead of the default `{{ .ConfirmationURL }}`.
 *
 * Failure reasons: `nocode` (no token_hash or type on the URL) and `verify`
 * (expired or already used, often by a scanner that opened it first).
 */
export function createAuthConfirm({ defaultNext, loginPath = "/login", onSignedIn }) {
    return async function GET(request) {
        const url = new URL(request.url);
        const tokenHash = url.searchParams.get("token_hash");
        const type = url.searchParams.get("type");
        const next = safeNextPath(url.searchParams.get("next"), defaultNext);
        const fail = (reason) => NextResponse.redirect(failRedirect(url.origin, loginPath, reason));
        if (!tokenHash || !type) {
            console.error("[auth/confirm] missing token_hash or type on confirm URL");
            return fail("nocode");
        }
        const supabase = await getSupabaseServer();
        const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
        if (!error) {
            await runOnSignedIn("auth/confirm", request, supabase, onSignedIn);
            return NextResponse.redirect(new URL(next, url.origin));
        }
        console.error("[auth/confirm] verifyOtp failed:", {
            message: error.message,
            status: error.status,
            code: error.code,
        });
        return fail("verify");
    };
}
