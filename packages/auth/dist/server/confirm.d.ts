import { type AuthRouteOptions } from "./routes.js";
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
export declare function createAuthConfirm({ defaultNext, loginPath, onSignedIn }: AuthRouteOptions): (request: Request) => Promise<Response>;
