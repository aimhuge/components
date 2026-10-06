/**
 * The Slack Web API calls apps make most: post / edit / ephemeral, a DM
 * opener, a channel joiner, a permalink, and the metadata-aware
 * "find the message I posted earlier" lookup. Each is a thin wrapper over
 * `callSlack` so every error funnel (Slack's `{ ok: false }`, a 5xx, a
 * timeout, a thrown fetch) is read in one place.
 *
 * Tokens are passed explicitly, not read from the module — apps load the
 * bot token off an installation row or env themselves and hand it in. A
 * missing token comes back as the same `refused` shape Slack itself uses
 * (`not_authed`); the wrapper never throws.
 *
 * The `unfurl_*` defaults are deliberate: most posts are mostly links, and
 * a GitHub / Vercel preview card under each one buries the line it belongs
 * to. The metadata shape is Slack's own (`metadata.event_type` +
 * `metadata.event_payload`) so a later `findMessageByMetadata` can locate
 * this message without storing its `ts` anywhere.
 */
import { type SlackAttempt } from "./api.js";
/** A Slack Block-Kit block. Kept loose — Slack's shape is wide and app-specific. */
export type Block = Record<string, unknown>;
/** Slack's `metadata` on a message: a typed payload a bot can find again. */
export interface MessageMetadata {
    event_type: string;
    event_payload: Record<string, unknown>;
}
export interface Deps {
    fetchImpl?: typeof fetch;
}
/**
 * `chat.postMessage`. `unfurl` defaults to false (preview cards would bury
 * the line each link belongs to). Omitted optional fields are not sent.
 */
export declare function postMessage(token: string, msg: {
    channel: string;
    text: string;
    blocks?: Block[];
    threadTs?: string;
    metadata?: MessageMetadata;
    unfurl?: boolean;
}, deps?: Deps): Promise<SlackAttempt>;
/** `chat.update`. Edit a message the same bot posted. */
export declare function updateMessage(token: string, msg: {
    channel: string;
    ts: string;
    text: string;
    blocks?: Block[];
    metadata?: MessageMetadata;
}, deps?: Deps): Promise<SlackAttempt>;
/** `chat.postMessage` with `response_type: "ephemeral"` — only the named user sees it. */
export declare function postEphemeral(token: string, msg: {
    channel: string;
    user: string;
    text: string;
    blocks?: Block[];
    threadTs?: string;
}, deps?: Deps): Promise<SlackAttempt>;
/** `chat.getPermalink`. The message's permanent URL, or null when Slack refused. */
export declare function getPermalink(token: string, channel: string, ts: string, deps?: Deps): Promise<string | null>;
/**
 * `conversations.open { users }`. The DM channel id for one Slack person, or
 * null on refusal. The caller pairs this with `postMessage` for a DM.
 */
export declare function openDm(token: string, slackUserId: string, deps?: Deps): Promise<string | null>;
/** `conversations.join`. The bot joining a public channel it wasn't in. */
export declare function joinChannel(token: string, channel: string, deps?: Deps): Promise<SlackAttempt>;
export declare function findMessageByMetadata(token: string, channel: string, eventType: string, match: (payload: Record<string, unknown>) => boolean, deps?: Deps & {
    limit?: number;
}): Promise<{
    ts: string;
    payload: Record<string, unknown>;
} | null>;
