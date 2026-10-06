import { verifySlackRequest } from "./verify.js";
/**
 * True the first time this event_id is seen. A failed write (not a duplicate)
 * still answers — Slack would otherwise retry forever.
 */
export async function firstDelivery(service, eventId) {
    if (!eventId)
        return true;
    const { error } = await service.from("slack_event_receipts").insert({ event_id: eventId });
    if (!error)
        return true;
    if (error.code === "23505")
        return false;
    console.warn(`[slack/events] recording ${eventId} failed (${error.message}); answering anyway`);
    return true;
}
/**
 * The message text with the bot's own @mention taken out (Slack renders an
 * @mention as `<@U…>` or `<@U…|display-name>`; both shapes are stripped).
 */
export function messageText(text, botUserId) {
    return (text ?? "").replace(new RegExp(`<@${botUserId}(\\|[^>]*)?>`, "g"), "").replace(/\s+/g, " ").trim();
}
/**
 * True when this event is a PERSON talking to the bot — an @mention or a DM
 * from a non-bot user. Bot messages (including the app's own replies, which
 * arrive as `message` events in DMs), edits, joins and other subtypes are
 * ignored. The app decides what to do with one of these.
 */
export function isPersonMessage(event, botUserId) {
    if (!event.user || event.bot_id || event.subtype || event.user === botUserId)
        return false;
    if (event.type === "app_mention")
        return true;
    return event.type === "message" && event.channel_type === "im";
}
/**
 * `app_uninstalled` is the whole app leaving. `tokens_revoked` matters too
 * when a bot token went (a person revoking their own user token leaves the
 * bot and any posts in place). Apps retire it however they retire an install.
 */
export function isUninstallEvent(event) {
    return event?.type === "app_uninstalled" || event?.type === "tokens_revoked";
}
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
export function readSlackRequest(input) {
    const verified = verifySlackRequest(input);
    if (!verified)
        return { kind: "unverified" };
    let parsed;
    try {
        parsed = JSON.parse(input.rawBody);
    }
    catch {
        return { kind: "bad_json" };
    }
    if (!parsed || typeof parsed !== "object")
        return { kind: "bad_json" };
    const obj = parsed;
    if (obj.type === "url_verification" && typeof obj.challenge === "string") {
        return { kind: "challenge", challenge: obj.challenge };
    }
    if (obj.type === "event_callback") {
        return { kind: "event", envelope: obj };
    }
    return { kind: "other", type: typeof obj.type === "string" ? obj.type : "" };
}
