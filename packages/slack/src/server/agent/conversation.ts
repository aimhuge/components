/**
 * Where a Slack conversation lives, and what the loop remembers of it.
 *
 * - An @mention in a channel is answered IN A THREAD, and the thread is the
 *   conversation: its root `ts` is the key, whether the mention started the
 *   thread or arrived inside one.
 * - A DM is one rolling conversation (key "dm") that forgets itself after
 *   six hours idle, so this morning's "schedule it for Tuesday" doesn't
 *   resolve against last week's draft. A threaded reply inside a DM is its
 *   own conversation, like a channel thread.
 *
 * Only the text people saw is kept — never tool calls — the last 20 messages
 * (`slack_conversations`).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatMessage } from "./loop.js";

export const MAX_REMEMBERED = 20;
export const DM_IDLE_MS = 6 * 60 * 60 * 1000;

export interface ConversationKey {
  teamId: string;
  channelId: string;
  threadKey: string;
  /** The `thread_ts` to reply with, or null to reply in the DM itself. */
  replyThreadTs: string | null;
  place: "dm" | "channel";
}

/** Where to answer an event, and which conversation it belongs to. */
export function conversationKey(event: {
  team: string;
  channel: string;
  ts: string;
  thread_ts?: string;
  channel_type?: string;
}): ConversationKey {
  const isDm = event.channel_type === "im" || event.channel.startsWith("D");
  if (isDm) {
    return {
      teamId: event.team,
      channelId: event.channel,
      threadKey: event.thread_ts ?? "dm",
      replyThreadTs: event.thread_ts ?? null,
      place: "dm",
    };
  }
  const root = event.thread_ts ?? event.ts;
  return { teamId: event.team, channelId: event.channel, threadKey: root, replyThreadTs: root, place: "channel" };
}

function asMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (m): m is ChatMessage =>
      !!m && typeof m === "object" && (m.role === "user" || m.role === "assistant") && typeof m.text === "string",
  );
}

/** The remembered turns, oldest first. A failed read is an empty memory, not an error. */
export async function loadConversation(
  service: SupabaseClient,
  key: ConversationKey,
  nowMs: number = Date.now(),
): Promise<ChatMessage[]> {
  const { data, error } = await service
    .from("slack_conversations")
    .select("messages, updated_at")
    .eq("team_id", key.teamId)
    .eq("channel_id", key.channelId)
    .eq("thread_key", key.threadKey)
    .maybeSingle();
  if (error || !data) return [];
  if (key.threadKey === "dm" && nowMs - Date.parse(String(data.updated_at)) > DM_IDLE_MS) return [];
  return asMessages(data.messages);
}

/** Remember this turn. Best-effort: losing memory must not lose the answer already sent. */
export async function saveConversation(
  service: SupabaseClient,
  key: ConversationKey,
  userId: string,
  messages: ChatMessage[],
): Promise<void> {
  const { error } = await service.from("slack_conversations").upsert(
    {
      team_id: key.teamId,
      channel_id: key.channelId,
      thread_key: key.threadKey,
      user_id: userId,
      messages: messages.slice(-MAX_REMEMBERED),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "team_id,channel_id,thread_key" },
  );
  if (error) console.warn(`[slack/conversation] saving ${key.teamId}/${key.channelId} failed: ${error.message}`);
}