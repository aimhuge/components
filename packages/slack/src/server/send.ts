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
import { callSlack, str, type SlackAttempt } from "./api.js";
import { getInstallation } from "./installations.js";
import { linksForUser } from "./links.js";

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
export type SendResult =
  | { ok: true; teamId: string | null; channel: string; ts: string }
  | { ok: false; reason: "not_linked" | "no_installation" | "refused" | "unreached"; error?: string };

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
export async function sendToUser(
  service: SupabaseClient,
  userId: string,
  message: OutgoingMessage,
  deps: SendDeps = {},
): Promise<SendResult> {
  try {
    const links = await linksForUser(service, userId);
    if (links.length === 0) return { ok: false, reason: "not_linked" };

    for (const link of links) {
      const install = await getInstallation(service, link.teamId);
      // `getInstallation` already filters out revoked installs, but the spec
      // is "the first whose installation is active" — be strict, not lenient.
      if (!install || install.status !== "active") continue;

      const openAttempt = await callSlack("conversations.open", {
        token: install.botToken,
        body: { users: link.slackUserId },
        fetchImpl: deps.fetchImpl,
      });
      if (openAttempt.kind !== "ok") return refusalToSendResult(openAttempt);
      const dmChannel = str(openAttempt.data.channel, "id");
      if (!dmChannel) return { ok: false, reason: "refused", error: "conversations.open returned no channel" };

      return await postMessage(install.botToken, dmChannel, message, deps, install.teamId);
    }

    return { ok: false, reason: "no_installation" };
  } catch (err) {
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
export async function sendToChannel(
  token: string,
  channel: string,
  message: OutgoingMessage,
  deps: SendDeps = {},
): Promise<SendResult> {
  try {
    return await postMessage(token, channel, message, deps, null);
  } catch (err) {
    return {
      ok: false,
      reason: "unreached",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** `chat.postMessage` with the unfurl opts the publisher always sets. */
async function postMessage(
  token: string,
  channel: string,
  message: OutgoingMessage,
  deps: SendDeps,
  teamId: string | null,
): Promise<SendResult> {
  const body: Record<string, unknown> = {
    channel,
    text: message.text,
    unfurl_links: false,
    unfurl_media: false,
  };
  if (message.blocks && message.blocks.length > 0) body.blocks = message.blocks;

  const attempt = await callSlack("chat.postMessage", { token, body, fetchImpl: deps.fetchImpl });
  if (attempt.kind !== "ok") return refusalToSendResult(attempt);
  const ts = str(attempt.data, "ts");
  if (!ts) return { ok: false, reason: "refused", error: "chat.postMessage returned no ts" };
  return { ok: true, teamId, channel, ts };
}

/** A `SlackAttempt` that wasn't `ok` becomes the matching `SendResult` shape. */
function refusalToSendResult(attempt: Exclude<SlackAttempt, { kind: "ok" }>): SendResult {
  if (attempt.kind === "unreached") {
    return {
      ok: false,
      reason: "unreached",
      error: attempt.timedOut ? "timed out" : attempt.message,
    };
  }
  return { ok: false, reason: "refused", error: attempt.error };
}