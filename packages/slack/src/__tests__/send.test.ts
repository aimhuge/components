/**
 * Tests for `sendToUser` and `sendToChannel` — the DM path, the channel
 * path, every error funnel, and the newest-active-link ordering. Each test
 * seeds the fake supabase, wires a `fetchImpl` that records what `callSlack`
 * would have asked Slack, and asserts on the result.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "./fake-supabase";
import { sendToChannel, sendToUser } from "../server/send.js";

const as = (db: FakeSupabase) => db as unknown as SupabaseClient;

const USER = "11111111-2222-3333-4444-555555555555";
const MESSAGE = { text: "hi" };

function linkRow(teamId: string, slackUserId: string, createdAt: string) {
  return { team_id: teamId, slack_user_id: slackUserId, user_id: USER, created_at: createdAt };
}

function installationRow(teamId: string, status = "active") {
  return {
    team_id: teamId,
    team_name: "Acme",
    bot_user_id: "B0",
    bot_token: `xoxb-${teamId}`,
    status,
  };
}

interface Call {
  url: string;
  body: Record<string, unknown>;
  token: string | null;
}

/** A `fetchImpl` that Slack always answers `ok` for, recording what was sent. */
function recordFetch(respond: (call: Call) => Record<string, unknown> = () => ({ ok: true })) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const token = headers.authorization?.replace(/^Bearer\s+/, "") ?? null;
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    const c: Call = { url, body, token };
    calls.push(c);
    return new Response(JSON.stringify(respond(c)), { status: 200, headers: { "content-type": "application/json" } });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

describe("sendToUser — DM path", () => {
  it("returns not_linked when the user has no link rows", async () => {
    const db = fakeSupabase({ slack_user_links: [], slack_installations: [] });
    const { fetchImpl, calls } = recordFetch();

    const result = await sendToUser(as(db), USER, MESSAGE, { fetchImpl });

    expect(result).toEqual({ ok: false, reason: "not_linked" });
    expect(calls).toHaveLength(0);
  });

  it("returns no_installation when the user's only link is to a revoked install", async () => {
    const db = fakeSupabase({
      slack_user_links: [linkRow("T1", "U1", "2026-01-01T00:00:00Z")],
      slack_installations: [{ ...installationRow("T1", "revoked") }],
    });
    const { fetchImpl, calls } = recordFetch();

    const result = await sendToUser(as(db), USER, MESSAGE, { fetchImpl });

    expect(result).toEqual({ ok: false, reason: "no_installation" });
    expect(calls).toHaveLength(0);
  });

  it("returns no_installation when every linked install is non-active", async () => {
    // An installation whose status is something other than `active` is also
    // unusable — `getInstallation` returns it but the spec is strict.
    const db = fakeSupabase({
      slack_user_links: [linkRow("T1", "U1", "2026-01-01T00:00:00Z")],
      slack_installations: [{ ...installationRow("T1", "expired") }],
    });
    const { fetchImpl, calls } = recordFetch();

    const result = await sendToUser(as(db), USER, MESSAGE, { fetchImpl });

    expect(result).toEqual({ ok: false, reason: "no_installation" });
    expect(calls).toHaveLength(0);
  });

  it("uses the newest active link first and ignores older revoked installs", async () => {
    // Newer link points at a still-active install; older link at a revoked
    // one. The newer wins without a Slack call against the old team.
    const db = fakeSupabase({
      slack_user_links: [
        linkRow("Told", "Uold", "2025-01-01T00:00:00Z"),
        linkRow("Tnew", "Unew", "2026-09-01T00:00:00Z"),
      ],
      slack_installations: [installationRow("Told", "revoked"), installationRow("Tnew", "active")],
    });
    const { fetchImpl, calls } = recordFetch((c) =>
      c.url.endsWith("/conversations.open") ? { ok: true, channel: { id: "D999" } } : { ok: true, ts: "1700000000.000100" },
    );

    const result = await sendToUser(as(db), USER, MESSAGE, { fetchImpl });

    expect(result).toEqual({ ok: true, teamId: "Tnew", channel: "D999", ts: "1700000000.000100" });
    // conversations.open on the active install, then chat.postMessage.
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).toContain("/conversations.open");
    expect(calls[0]!.token).toBe("xoxb-Tnew");
    expect(calls[0]!.body).toEqual({ users: "Unew" });
    expect(calls[1]!.url).toContain("/chat.postMessage");
    expect(calls[1]!.token).toBe("xoxb-Tnew");
    expect(calls[1]!.body.channel).toBe("D999");
  });

  it("falls back from a newest revoked link to an older active one", async () => {
    const db = fakeSupabase({
      slack_user_links: [
        linkRow("Told", "Uold", "2025-01-01T00:00:00Z"),
        linkRow("Tnew", "Unew", "2026-09-01T00:00:00Z"),
      ],
      slack_installations: [installationRow("Told", "active"), installationRow("Tnew", "revoked")],
    });
    const { fetchImpl, calls } = recordFetch((c) =>
      c.url.endsWith("/conversations.open") ? { ok: true, channel: { id: "D-old" } } : { ok: true, ts: "1.0" },
    );

    const result = await sendToUser(as(db), USER, MESSAGE, { fetchImpl });

    expect(result).toEqual({ ok: true, teamId: "Told", channel: "D-old", ts: "1.0" });
    // No call went to Tnew.
    expect(calls.every((c) => c.token === "xoxb-Told")).toBe(true);
  });

  it("sends blocks and the unfurl opts on chat.postMessage", async () => {
    const db = fakeSupabase({
      slack_user_links: [linkRow("T1", "U1", "2026-01-01T00:00:00Z")],
      slack_installations: [installationRow("T1", "active")],
    });
    const { fetchImpl, calls } = recordFetch((c) =>
      c.url.endsWith("/conversations.open") ? { ok: true, channel: { id: "D1" } } : { ok: true, ts: "1.0" },
    );

    const result = await sendToUser(
      as(db),
      USER,
      { text: "hello", blocks: [{ type: "section", text: { type: "plain_text", text: "hi" } }] },
      { fetchImpl },
    );

    expect(result.ok).toBe(true);
    const post = calls[1]!;
    expect(post.body.blocks).toEqual([{ type: "section", text: { type: "plain_text", text: "hi" } }]);
    expect(post.body.unfurl_links).toBe(false);
    expect(post.body.unfurl_media).toBe(false);
  });

  it("omits blocks from chat.postMessage when not given", async () => {
    const db = fakeSupabase({
      slack_user_links: [linkRow("T1", "U1", "2026-01-01T00:00:00Z")],
      slack_installations: [installationRow("T1", "active")],
    });
    const { fetchImpl, calls } = recordFetch((c) =>
      c.url.endsWith("/conversations.open") ? { ok: true, channel: { id: "D1" } } : { ok: true, ts: "1.0" },
    );

    await sendToUser(as(db), USER, MESSAGE, { fetchImpl });

    const post = calls[1]!;
    expect("blocks" in post.body).toBe(false);
  });

  it("returns refused with Slack's error code when conversations.open fails", async () => {
    const db = fakeSupabase({
      slack_user_links: [linkRow("T1", "U1", "2026-01-01T00:00:00Z")],
      slack_installations: [installationRow("T1", "active")],
    });
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: false, error: "not_in_channel" }), { status: 200 }));

    const result = await sendToUser(as(db), USER, MESSAGE, { fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(result).toEqual({ ok: false, reason: "refused", error: "not_in_channel" });
  });

  it("returns refused with the Slack code when chat.postMessage fails", async () => {
    const db = fakeSupabase({
      slack_user_links: [linkRow("T1", "U1", "2026-01-01T00:00:00Z")],
      slack_installations: [installationRow("T1", "active")],
    });
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith("/conversations.open")) return new Response(JSON.stringify({ ok: true, channel: { id: "D1" } }), { status: 200 });
      return new Response(JSON.stringify({ ok: false, error: "msg_too_long" }), { status: 200 });
    });

    const result = await sendToUser(as(db), USER, MESSAGE, { fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(result).toEqual({ ok: false, reason: "refused", error: "msg_too_long" });
  });

  it("returns unreached (not a throw) when fetch itself throws", async () => {
    const db = fakeSupabase({
      slack_user_links: [linkRow("T1", "U1", "2026-01-01T00:00:00Z")],
      slack_installations: [installationRow("T1", "active")],
    });
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });

    const result = await sendToUser(as(db), USER, MESSAGE, { fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(result).toEqual({ ok: false, reason: "unreached", error: "fetch failed" });
  });

  it("returns unreached with 'timed out' on an AbortError", async () => {
    const db = fakeSupabase({
      slack_user_links: [linkRow("T1", "U1", "2026-01-01T00:00:00Z")],
      slack_installations: [installationRow("T1", "active")],
    });
    const fetchImpl = vi.fn(async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    });

    const result = await sendToUser(as(db), USER, MESSAGE, { fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(result).toMatchObject({ ok: false, reason: "unreached", error: "timed out" });
  });

  it("returns unreached when a Supabase read throws (never propagates)", async () => {
    // A service whose every from() call throws — simulates the typed
    // wrapper letting through a real error.
    const service = {
      from: () => {
        throw new Error("db connection refused");
      },
    } as unknown as SupabaseClient;
    const { fetchImpl } = recordFetch();

    const result = await sendToUser(service, USER, MESSAGE, { fetchImpl });

    expect(result).toEqual({ ok: false, reason: "unreached", error: "db connection refused" });
  });
});

describe("sendToChannel — direct channel path", () => {
  it("posts to the named channel with the caller's token", async () => {
    const { fetchImpl, calls } = recordFetch(() => ({ ok: true, ts: "9.9" }));

    const result = await sendToChannel("xoxb-chan", "C1", MESSAGE, { fetchImpl });

    // teamId is unknown on this path → null in the result.
    expect(result).toEqual({ ok: true, teamId: null, channel: "C1", ts: "9.9" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain("/chat.postMessage");
    expect(calls[0]!.token).toBe("xoxb-chan");
    expect(calls[0]!.body.channel).toBe("C1");
  });

  it("sends blocks and the unfurl opts when given", async () => {
    const { fetchImpl, calls } = recordFetch(() => ({ ok: true, ts: "9.9" }));

    const result = await sendToChannel(
      "xoxb-chan",
      "C1",
      { text: "hi", blocks: [{ type: "section", text: { type: "plain_text", text: "yo" } }] },
      { fetchImpl },
    );
    expect(result.ok).toBe(true);
    const body = calls[0]!.body;
    expect(body.blocks).toEqual([{ type: "section", text: { type: "plain_text", text: "yo" } }]);
    expect(body.unfurl_links).toBe(false);
    expect(body.unfurl_media).toBe(false);
  });

  it("returns refused when chat.postMessage fails", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: false, error: "channel_not_found" }), { status: 200 }));
    const result = await sendToChannel("xoxb-chan", "C1", MESSAGE, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result).toEqual({ ok: false, reason: "refused", error: "channel_not_found" });
  });

  it("returns unreached (not a throw) when fetch itself throws", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("network down");
    });
    const result = await sendToChannel("xoxb-chan", "C1", MESSAGE, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result).toEqual({ ok: false, reason: "unreached", error: "network down" });
  });

  it("returns unreached with 'timed out' on an AbortError", async () => {
    const fetchImpl = vi.fn(async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    });
    const result = await sendToChannel("xoxb-chan", "C1", MESSAGE, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result).toMatchObject({ ok: false, reason: "unreached", error: "timed out" });
  });
});