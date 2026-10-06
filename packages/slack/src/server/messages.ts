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
import { callSlack, str, type SlackAttempt } from "./api.js";

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
export async function postMessage(
  token: string,
  msg: {
    channel: string;
    text: string;
    blocks?: Block[];
    threadTs?: string;
    metadata?: MessageMetadata;
    unfurl?: boolean;
  },
  deps: Deps = {},
): Promise<SlackAttempt> {
  const body: Record<string, unknown> = { channel: msg.channel, text: msg.text };
  if (msg.blocks && msg.blocks.length > 0) body.blocks = msg.blocks;
  if (msg.threadTs) body.thread_ts = msg.threadTs;
  if (msg.metadata) body.metadata = msg.metadata;
  if (msg.unfurl !== true) {
    body.unfurl_links = false;
    body.unfurl_media = false;
  } else {
    body.unfurl_links = true;
    body.unfurl_media = true;
  }
  return callSlack("chat.postMessage", { token, body, fetchImpl: deps.fetchImpl });
}

/** `chat.update`. Edit a message the same bot posted. */
export async function updateMessage(
  token: string,
  msg: { channel: string; ts: string; text: string; blocks?: Block[]; metadata?: MessageMetadata },
  deps: Deps = {},
): Promise<SlackAttempt> {
  const body: Record<string, unknown> = { channel: msg.channel, ts: msg.ts, text: msg.text };
  if (msg.blocks && msg.blocks.length > 0) body.blocks = msg.blocks;
  if (msg.metadata) body.metadata = msg.metadata;
  return callSlack("chat.update", { token, body, fetchImpl: deps.fetchImpl });
}

/** `chat.postMessage` with `response_type: "ephemeral"` — only the named user sees it. */
export async function postEphemeral(
  token: string,
  msg: { channel: string; user: string; text: string; blocks?: Block[]; threadTs?: string },
  deps: Deps = {},
): Promise<SlackAttempt> {
  const body: Record<string, unknown> = {
    channel: msg.channel,
    user: msg.user,
    text: msg.text,
    response_type: "ephemeral",
  };
  if (msg.blocks && msg.blocks.length > 0) body.blocks = msg.blocks;
  if (msg.threadTs) body.thread_ts = msg.threadTs;
  return callSlack("chat.postMessage", { token, body, fetchImpl: deps.fetchImpl });
}

/** `chat.getPermalink`. The message's permanent URL, or null when Slack refused. */
export async function getPermalink(token: string, channel: string, ts: string, deps: Deps = {}): Promise<string | null> {
  const attempt = await callSlack("chat.getPermalink", {
    token,
    body: { channel, ts },
    fetchImpl: deps.fetchImpl,
  });
  if (attempt.kind !== "ok") return null;
  return str(attempt.data, "permalink");
}

/**
 * `conversations.open { users }`. The DM channel id for one Slack person, or
 * null on refusal. The caller pairs this with `postMessage` for a DM.
 */
export async function openDm(token: string, slackUserId: string, deps: Deps = {}): Promise<string | null> {
  const attempt = await callSlack("conversations.open", {
    token,
    body: { users: slackUserId },
    fetchImpl: deps.fetchImpl,
  });
  if (attempt.kind !== "ok") return null;
  return str(attempt.data.channel, "id");
}

/** `conversations.join`. The bot joining a public channel it wasn't in. */
export async function joinChannel(token: string, channel: string, deps: Deps = {}): Promise<SlackAttempt> {
  return callSlack("conversations.join", { token, body: { channel }, fetchImpl: deps.fetchImpl });
}

/**
 * The newest recent message in `channel` whose metadata is `eventType` and
 * passes `match` — how a later event finds the message an earlier one posted,
 * with no table of message ids. Reads the last `limit` messages only; past
 * that, the caller posts a fresh message instead.
 *
 * Needs `channels:history` / `groups:history` (public / private channel) and
 * the bot in the channel.
 *
 * `limit` defaults to 15 because the app is publicly distributed: Slack
 * caps `conversations.history` for non-Marketplace distributed apps at 15
 * messages and one call a minute. One call per finished event fits; a
 * rate-limited call just returns null.
 */
/** One `conversations.history` entry, as far as metadata matching reads it. */
interface HistoryMessage {
  ts: string;
  metadata?: { event_type?: string; event_payload?: Record<string, unknown> };
}

export async function findMessageByMetadata(
  token: string,
  channel: string,
  eventType: string,
  match: (payload: Record<string, unknown>) => boolean,
  deps: Deps & { limit?: number } = {},
): Promise<{ ts: string; payload: Record<string, unknown> } | null> {
  const limit = deps.limit ?? 15;
  const attempt = await callSlack(
    "conversations.history",
    {
      token,
      body: { channel, limit, include_all_metadata: true },
      fetchImpl: deps.fetchImpl,
    },
  );
  if (attempt.kind !== "ok") return null;
  const messages = Array.isArray(attempt.data.messages) ? (attempt.data.messages as HistoryMessage[]) : [];
  for (const m of messages) {
    if (m.metadata?.event_type === eventType && match(m.metadata.event_payload ?? {})) {
      return { ts: m.ts, payload: m.metadata.event_payload ?? {} };
    }
  }
  return null;
}
