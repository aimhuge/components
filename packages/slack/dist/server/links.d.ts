/**
 * Link a Slack person to an app account.
 *
 * How: the bot DMs them a `<origin>/<path>?t=…` URL whose payload names
 * HMAC(s, secret) (team, Slack user, team name, 15-minute expiry). The page
 * needs BOTH halves to act — only the Slack person named in the payload was
 * sent the URL, and only a signed-in app user can press the button. The
 * button calls `linkSlackUser`, which UPSERTS on `(team_id, slack_user_id)`,
 * so re-linking to a different app account replaces the old one (the
 * previous link's user is no longer the one this Slack person acts as;
 * that's the intent).
 *
 * Pure: the secret is a parameter, not a module read, so the unit tests
 * sign and verify against a known value with no env.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
/** 15 minutes, the same window the per-user link URL lives for. */
export declare const LINK_TOKEN_TTL_MS: number;
export interface SignLinkTokenInput {
    teamId: string;
    slackUserId: string;
    teamName?: string | null;
}
export interface VerifiedLink {
    teamId: string;
    slackUserId: string;
    teamName: string | null;
}
/**
 * Sign a link token: `<base64url payload>.<base64url HMAC>`.
 *
 * The payload is JSON, base64url-encoded; the signature is HMAC-SHA256 over
 * the EXACT bytes of the payload part (not the full token), keyed by `secret`.
 * The 15-minute TTL lives in the payload, so it's bound to the signature and
 * can't be edited by the recipient.
 */
export declare function signLinkToken(input: SignLinkTokenInput, secret: string, nowMs?: number): string;
/**
 * Verify a token minted by `signLinkToken`. Returns null on ANY failure
 * (bad signature, expired, malformed payload, wrong shape) — the caller cannot
 * distinguish "the link expired" from "the link was tampered with", because
 * both mean the same thing: don't trust it.
 *
 * Shape rules:
 *   - `teamId` starts with `T` (a workspace) or `E` (an enterprise grid)
 *   - `slackUserId` starts with `U` (a person) or `W` (a rare legacy user id)
 *
 * These are Slack's own id prefixes; refusing anything else stops a tampered
 * payload from smuggling arbitrary strings into the upsert.
 */
export declare function verifyLinkToken(token: string, secret: string, nowMs?: number): VerifiedLink | null;
/**
 * Build the URL the bot DMs to the Slack person. The path defaults to
 * `/slack/link`, the convention BlastCP and DrayKE both adopt; apps that
 * mount the link page elsewhere can pass a different path.
 */
export declare function linkUrl(origin: string, token: string, path?: string): string;
/**
 * Look up the app user this Slack person is currently linked as, if any.
 * Used by the client to short-circuit the "link your account" path for anyone
 * who already linked (the link page itself is still useful as a re-link).
 */
export declare function linkedUserId(service: SupabaseClient, teamId: string, slackUserId: string): Promise<string | null>;
/**
 * Upsert a `(team_id, slack_user_id)` → `user_id` mapping. The PK is the pair,
 * so a Slack person re-linking to a different app account replaces the old
 * link — a person owns one Slack identity, so they shouldn't appear to act
 * as two app users. Throws on DB error (caller renders an error page).
 */
export declare function linkSlackUser(service: SupabaseClient, input: {
    teamId: string;
    slackUserId: string;
    userId: string;
}): Promise<void>;
/**
 * Every `(team, slackUser)` the user is currently linked to, newest first.
 * "Newest" is `created_at` desc — the order `sendToUser` walks to find the
 * first install that's still alive.
 */
export declare function linksForUser(service: SupabaseClient, userId: string): Promise<Array<{
    teamId: string;
    slackUserId: string;
    createdAt: string;
}>>;
