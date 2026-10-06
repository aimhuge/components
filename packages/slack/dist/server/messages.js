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
import { callSlack, str } from "./api.js";
/**
 * `chat.postMessage`. `unfurl` defaults to false (preview cards would bury
 * the line each link belongs to). Omitted optional fields are not sent.
 */
export async function postMessage(token, msg, deps = {}) {
    const body = { channel: msg.channel, text: msg.text };
    if (msg.blocks && msg.blocks.length > 0)
        body.blocks = msg.blocks;
    if (msg.threadTs)
        body.thread_ts = msg.threadTs;
    if (msg.metadata)
        body.metadata = msg.metadata;
    if (msg.unfurl !== true) {
        body.unfurl_links = false;
        body.unfurl_media = false;
    }
    else {
        body.unfurl_links = true;
        body.unfurl_media = true;
    }
    return callSlack("chat.postMessage", { token, body, fetchImpl: deps.fetchImpl });
}
/** `chat.update`. Edit a message the same bot posted. */
export async function updateMessage(token, msg, deps = {}) {
    const body = { channel: msg.channel, ts: msg.ts, text: msg.text };
    if (msg.blocks && msg.blocks.length > 0)
        body.blocks = msg.blocks;
    if (msg.metadata)
        body.metadata = msg.metadata;
    return callSlack("chat.update", { token, body, fetchImpl: deps.fetchImpl });
}
/** `chat.postMessage` with `response_type: "ephemeral"` — only the named user sees it. */
export async function postEphemeral(token, msg, deps = {}) {
    const body = {
        channel: msg.channel,
        user: msg.user,
        text: msg.text,
        response_type: "ephemeral",
    };
    if (msg.blocks && msg.blocks.length > 0)
        body.blocks = msg.blocks;
    if (msg.threadTs)
        body.thread_ts = msg.threadTs;
    return callSlack("chat.postMessage", { token, body, fetchImpl: deps.fetchImpl });
}
/** `chat.getPermalink`. The message's permanent URL, or null when Slack refused. */
export async function getPermalink(token, channel, ts, deps = {}) {
    const attempt = await callSlack("chat.getPermalink", {
        token,
        body: { channel, ts },
        fetchImpl: deps.fetchImpl,
    });
    if (attempt.kind !== "ok")
        return null;
    return str(attempt.data, "permalink");
}
/**
 * `conversations.open { users }`. The DM channel id for one Slack person, or
 * null on refusal. The caller pairs this with `postMessage` for a DM.
 */
export async function openDm(token, slackUserId, deps = {}) {
    const attempt = await callSlack("conversations.open", {
        token,
        body: { users: slackUserId },
        fetchImpl: deps.fetchImpl,
    });
    if (attempt.kind !== "ok")
        return null;
    return str(attempt.data.channel, "id");
}
/** `conversations.join`. The bot joining a public channel it wasn't in. */
export async function joinChannel(token, channel, deps = {}) {
    return callSlack("conversations.join", { token, body: { channel }, fetchImpl: deps.fetchImpl });
}
export async function findMessageByMetadata(token, channel, eventType, match, deps = {}) {
    const limit = deps.limit ?? 15;
    const attempt = await callSlack("conversations.history", {
        token,
        body: { channel, limit, include_all_metadata: true },
        fetchImpl: deps.fetchImpl,
    });
    if (attempt.kind !== "ok")
        return null;
    const messages = Array.isArray(attempt.data.messages) ? attempt.data.messages : [];
    for (const m of messages) {
        if (m.metadata?.event_type === eventType && match(m.metadata.event_payload ?? {})) {
            return { ts: m.ts, payload: m.metadata.event_payload ?? {} };
        }
    }
    return null;
}
