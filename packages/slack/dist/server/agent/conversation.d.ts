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
export declare const MAX_REMEMBERED = 20;
export declare const DM_IDLE_MS: number;
export interface ConversationKey {
    teamId: string;
    channelId: string;
    threadKey: string;
    /** The `thread_ts` to reply with, or null to reply in the DM itself. */
    replyThreadTs: string | null;
    place: "dm" | "channel";
}
/** Where to answer an event, and which conversation it belongs to. */
export declare function conversationKey(event: {
    team: string;
    channel: string;
    ts: string;
    thread_ts?: string;
    channel_type?: string;
}): ConversationKey;
/** The remembered turns, oldest first. A failed read is an empty memory, not an error. */
export declare function loadConversation(service: SupabaseClient, key: ConversationKey, nowMs?: number): Promise<ChatMessage[]>;
/** Remember this turn. Best-effort: losing memory must not lose the answer already sent. */
export declare function saveConversation(service: SupabaseClient, key: ConversationKey, userId: string, messages: ChatMessage[]): Promise<void>;
