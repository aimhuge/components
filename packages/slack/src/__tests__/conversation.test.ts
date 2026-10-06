import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fakeSupabase } from "./fake-supabase";
import {
  DM_IDLE_MS,
  MAX_REMEMBERED,
  conversationKey,
  loadConversation,
  saveConversation,
  type ConversationKey,
} from "../server/agent/conversation";

const KEY: ConversationKey = {
  teamId: "T1",
  channelId: "C1",
  threadKey: "100.1",
  replyThreadTs: "100.1",
  place: "channel",
};

describe("conversationKey", () => {
  it("answers a channel mention in a thread rooted at the mention", () => {
    const key = conversationKey({ team: "T1", channel: "C1", ts: "100.1" });
    expect(key).toMatchObject({ threadKey: "100.1", replyThreadTs: "100.1", place: "channel" });
  });

  it("keeps a mention inside a thread in that thread", () => {
    const key = conversationKey({ team: "T1", channel: "C1", ts: "200.2", thread_ts: "100.1" });
    expect(key).toMatchObject({ threadKey: "100.1", replyThreadTs: "100.1" });
  });

  it("treats a DM as one rolling conversation, replied to in place", () => {
    const key = conversationKey({ team: "T1", channel: "D1", ts: "300.3", channel_type: "im" });
    expect(key).toMatchObject({ threadKey: "dm", replyThreadTs: null, place: "dm" });
  });

  it("treats a DM-threaded reply as its own conversation", () => {
    const key = conversationKey({ team: "T1", channel: "D1", ts: "400.4", thread_ts: "300.3", channel_type: "im" });
    expect(key).toMatchObject({ threadKey: "300.3", replyThreadTs: "300.3", place: "dm" });
  });
});

describe("loadConversation / saveConversation", () => {
  it("returns an empty memory when nothing has been remembered", async () => {
    const fake = fakeSupabase({});
    const service = fake as unknown as SupabaseClient;
    expect(await loadConversation(service, KEY, 0)).toEqual([]);
  });

  it("returns the remembered turns, oldest first", async () => {
    const service = fakeSupabase({
      slack_conversations: [
        {
          team_id: "T1",
          channel_id: "C1",
          thread_key: "100.1",
          user_id: "u1",
          messages: [
            { role: "user", text: "one" },
            { role: "assistant", text: "answer" },
          ],
          updated_at: new Date(0).toISOString(),
        },
      ],
    }) as unknown as SupabaseClient;
    expect(await loadConversation(service, KEY, 0)).toEqual([
      { role: "user", text: "one" },
      { role: "assistant", text: "answer" },
    ]);
  });

  it("returns an empty memory when the DM conversation is older than DM_IDLE_MS", async () => {
    const oldUpdate = new Date(0).toISOString();
    const service = fakeSupabase({
      slack_conversations: [
        {
          team_id: "T1",
          channel_id: "D1",
          thread_key: "dm",
          user_id: "u1",
          messages: [{ role: "user", text: "stale" }],
          updated_at: oldUpdate,
        },
      ],
    }) as unknown as SupabaseClient;
    const dmKey: ConversationKey = { teamId: "T1", channelId: "D1", threadKey: "dm", replyThreadTs: null, place: "dm" };
    expect(await loadConversation(service, dmKey, DM_IDLE_MS + 1)).toEqual([]);
    // Right on the boundary, the row is still fresh.
    expect(await loadConversation(service, dmKey, DM_IDLE_MS)).toEqual([{ role: "user", text: "stale" }]);
  });

  it("saveConversation upserts on (team_id, channel_id, thread_key)", async () => {
    const fake = fakeSupabase({});
    const service = fake as unknown as SupabaseClient;
    await saveConversation(service, KEY, "u1", [{ role: "user", text: "hi" }, { role: "assistant", text: "yo" }]);
    expect(fake.tables.slack_conversations).toHaveLength(1);
    expect(fake.tables.slack_conversations?.[0]).toMatchObject({
      team_id: "T1",
      channel_id: "C1",
      thread_key: "100.1",
      user_id: "u1",
      messages: [{ role: "user", text: "hi" }, { role: "assistant", text: "yo" }],
    });
  });

  it("saveConversation caps messages at the last MAX_REMEMBERED", async () => {
    const fake = fakeSupabase({});
    const service = fake as unknown as SupabaseClient;
    const many = Array.from({ length: MAX_REMEMBERED + 5 }, (_, i) => ({ role: "user" as const, text: `m${i}` }));
    await saveConversation(service, KEY, "u1", many);
    const stored = fake.tables.slack_conversations![0]!.messages as Array<{ text: string }>;
    expect(stored).toHaveLength(MAX_REMEMBERED);
    expect(stored[0]?.text).toBe("m5");
    expect(stored.at(-1)?.text).toBe(`m${MAX_REMEMBERED + 4}`);
  });

  it("saveConversation overwrites an existing row for the same key", async () => {
    const fake = fakeSupabase({
      slack_conversations: [
        {
          team_id: "T1",
          channel_id: "C1",
          thread_key: "100.1",
          user_id: "u1",
          messages: [{ role: "user", text: "old" }],
          updated_at: new Date(0).toISOString(),
        },
      ],
    });
    const service = fake as unknown as SupabaseClient;
    await saveConversation(service, KEY, "u1", [{ role: "user", text: "new" }]);
    expect(fake.tables.slack_conversations).toHaveLength(1);
    expect(fake.tables.slack_conversations![0]!.messages).toEqual([{ role: "user", text: "new" }]);
  });
});