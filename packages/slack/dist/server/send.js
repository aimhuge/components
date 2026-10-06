import { callSlack, str } from "./api.js";
import { getInstallation } from "./installations.js";
import { linksForUser } from "./links.js";
/**
 * Send `message` to `userId` as a DM. Walks the user's links newest first
 * and uses the first whose install is still active. No links → `not_linked`.
 * None active → `no_installation`. Slack refused / didn't answer →
 * `refused` / `unreached`. NEVER throws — an exception is reported as
 * `unreached` with its message.
 */
export async function sendToUser(service, userId, message, deps = {}) {
    try {
        const links = await linksForUser(service, userId);
        if (links.length === 0)
            return { ok: false, reason: "not_linked" };
        for (const link of links) {
            const install = await getInstallation(service, link.teamId);
            // `getInstallation` already filters out revoked installs, but the spec
            // is "the first whose installation is active" — be strict, not lenient.
            if (!install || install.status !== "active")
                continue;
            const openAttempt = await callSlack("conversations.open", {
                token: install.botToken,
                body: { users: link.slackUserId },
                fetchImpl: deps.fetchImpl,
            });
            if (openAttempt.kind !== "ok")
                return refusalToSendResult(openAttempt);
            const dmChannel = str(openAttempt.data.channel, "id");
            if (!dmChannel)
                return { ok: false, reason: "refused", error: "conversations.open returned no channel" };
            return await postMessage(install.botToken, dmChannel, message, deps, install.teamId);
        }
        return { ok: false, reason: "no_installation" };
    }
    catch (err) {
        // An unexpected exception (a Supabase read that the typed wrapper let
        // through, a `getInstallation` that threw on a DB error) is reported as
        // `unreached`: Slack may have been contacted, may not, we don't know.
        return {
            ok: false,
            reason: "unreached",
            error: err instanceof Error ? err.message : String(err),
        };
    }
}
/**
 * Send `message` to `channel` with `token` (typically a bot token, possibly
 * a webhook). `teamId` is unknown to the package here — the caller didn't
 * give one — so the result carries `null`. Never throws.
 */
export async function sendToChannel(token, channel, message, deps = {}) {
    try {
        return await postMessage(token, channel, message, deps, null);
    }
    catch (err) {
        return {
            ok: false,
            reason: "unreached",
            error: err instanceof Error ? err.message : String(err),
        };
    }
}
/** `chat.postMessage` with the unfurl opts the publisher always sets. */
async function postMessage(token, channel, message, deps, teamId) {
    const body = {
        channel,
        text: message.text,
        unfurl_links: false,
        unfurl_media: false,
    };
    if (message.blocks && message.blocks.length > 0)
        body.blocks = message.blocks;
    const attempt = await callSlack("chat.postMessage", { token, body, fetchImpl: deps.fetchImpl });
    if (attempt.kind !== "ok")
        return refusalToSendResult(attempt);
    const ts = str(attempt.data, "ts");
    if (!ts)
        return { ok: false, reason: "refused", error: "chat.postMessage returned no ts" };
    return { ok: true, teamId, channel, ts };
}
/** A `SlackAttempt` that wasn't `ok` becomes the matching `SendResult` shape. */
function refusalToSendResult(attempt) {
    if (attempt.kind === "unreached") {
        return {
            ok: false,
            reason: "unreached",
            error: attempt.timedOut ? "timed out" : attempt.message,
        };
    }
    return { ok: false, reason: "refused", error: attempt.error };
}
