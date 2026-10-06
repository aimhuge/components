/**
 * One Events API delivery, after the route has verified it and already
 * answered Slack (the 3-second rule — the route runs the work in `after()`).
 *
 * This module is app-neutral: it parses Slack's envelope and decides only the
 * structural questions every app asks the same way —
 *   - is this an event we should record (so a Slack retry stops)?
 *   - is this an uninstall (so the app can retire its install)?
 *   - is this a person talking to the bot (so the app can decide what that
 *     means)?
 *
 * Dispatch — "the person said `schedule it for Tuesday` in the channel —
 * answer" — is the APP'S. Apps wrap `readSlackRequest` and `firstDelivery`
 * with their own install lookup and their own answer loop. This file never
 * imports Next.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
export interface SlackEnvelope {
    type?: string;
    team_id?: string;
    event_id?: string;
    event?: SlackEvent;
}
export interface SlackEvent {
    type?: string;
    subtype?: string;
    user?: string;
    bot_id?: string;
    text?: string;
    ts?: string;
    thread_ts?: string;
    channel?: string;
    channel_type?: string;
    team?: string;
}
/**
 * True the first time this event_id is seen. A failed write (not a duplicate)
 * still answers — Slack would otherwise retry forever.
 */
export declare function firstDelivery(service: SupabaseClient, eventId: string | undefined): Promise<boolean>;
/**
 * The message text with the bot's own @mention taken out (Slack renders an
 * @mention as `<@U…>` or `<@U…|display-name>`; both shapes are stripped).
 */
export declare function messageText(text: string | undefined, botUserId: string): string;
/**
 * True when this event is a PERSON talking to the bot — an @mention or a DM
 * from a non-bot user. Bot messages (including the app's own replies, which
 * arrive as `message` events in DMs), edits, joins and other subtypes are
 * ignored. The app decides what to do with one of these.
 */
export declare function isPersonMessage(event: SlackEvent, botUserId: string): boolean;
/**
 * `app_uninstalled` is the whole app leaving. `tokens_revoked` matters too
 * when a bot token went (a person revoking their own user token leaves the
 * bot and any posts in place). Apps retire it however they retire an install.
 */
export declare function isUninstallEvent(event: SlackEvent | undefined): boolean;
export type ReadSlackRequestResult = {
    kind: "unverified";
} | {
    kind: "bad_json";
} | {
    kind: "challenge";
    challenge: string;
} | {
    kind: "event";
    envelope: SlackEnvelope;
} | {
    kind: "other";
    type: string;
};
/**
 * Verify the request signature against the raw bytes Slack sent, then parse
 * the envelope and route it. Order matters: an unverified request is
 * answered before the body is parsed, because the parse is a sunk cost an
 * attacker would otherwise make us pay.
 *
 * - `url_verification` → challenge (Slack's handshake).
 * - `event_callback` → event envelope; the app decides what to do with it.
 * - everything else (`block_actions`, `slash_commands`, …) → `other`, with
 *   `type` so the app can dispatch.
 *
 * `bad_json` covers a request that verified but won't parse — Slack almost
 * never sends that; the right reply is a 400, not a 500.
 */
export declare function readSlackRequest(input: {
    rawBody: string;
    timestamp: string | null;
    signature: string | null;
    signingSecret: string;
    nowS?: number;
}): ReadSlackRequestResult;
