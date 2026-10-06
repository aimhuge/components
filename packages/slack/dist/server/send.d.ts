/**
 * Send a Slack message — to a person (as a DM, via their link) or to a
 * channel (with a bot token the app already has). Two entry points, one
 * `chat.postMessage` underneath.
 *
 * The package owns the "where do I get the token from?" half. For a user,
 * the link is the bridge to a workspace the app may not have its own row
 * for, and `linksForUser` is the lookup. For a channel, the app already
 * knows the token (from its own channel row, its own env, or a webhook)
 * and calls `sendToChannel` directly.
 *
 * Every error funnel is a `SendResult` — these are the hot path (a reminder
 * publisher, a customer's reply feed) and they call without a try/catch.
 * No throw, no surprise.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
/** A Slack message: plain-text fallback plus optional blocks. */
export interface OutgoingMessage {
    text: string;
    blocks?: Record<string, unknown>[];
}
/**
 * What happened. `ok: true` carries the workspace (null on the channel path,
 * where the app's caller didn't give one), the channel id, and the message
 * ts. `ok: false` carries a `reason` in a fixed vocabulary and the platform's
 * own error code so the caller can decide without re-running the logic.
 *
 * - `not_linked`      the user hasn't connected their Slack account
 * - `no_installation` every team they're linked to has had the app removed
 * - `refused`         Slack answered no (auth, scope, rate limit, …)
 * - `unreached`       Slack didn't answer at all (network, timeout)
 */
export type SendResult = {
    ok: true;
    teamId: string | null;
    channel: string;
    ts: string;
} | {
    ok: false;
    reason: "not_linked" | "no_installation" | "refused" | "unreached";
    error?: string;
};
interface SendDeps {
    fetchImpl?: typeof fetch;
}
/**
 * Send `message` to `userId` as a DM. Walks the user's links newest first
 * and uses the first whose install is still active. No links → `not_linked`.
 * None active → `no_installation`. Slack refused / didn't answer →
 * `refused` / `unreached`. NEVER throws — an exception is reported as
 * `unreached` with its message.
 */
export declare function sendToUser(service: SupabaseClient, userId: string, message: OutgoingMessage, deps?: SendDeps): Promise<SendResult>;
/**
 * Send `message` to `channel` with `token` (typically a bot token, possibly
 * a webhook). `teamId` is unknown to the package here — the caller didn't
 * give one — so the result carries `null`. Never throws.
 */
export declare function sendToChannel(token: string, channel: string, message: OutgoingMessage, deps?: SendDeps): Promise<SendResult>;
export {};
