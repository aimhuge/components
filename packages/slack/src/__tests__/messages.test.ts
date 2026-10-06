/**
 * Tests for the Web API wrappers in `src/server/messages.ts`. Each test wires
 * a `fetchImpl` that records what `callSlack` would have asked Slack and
 * returns the JSON shape a given endpoint hands back. The wrapper is the
 * only seam between the app and `https://slack.com/api/*`, so these tests
 * also assert the request shape — that the body carries (or omits) the
 * fields Slack itself reads.
 */
import { describe, expect, it, vi } from "vitest";
import {
  findMessageByMetadata,
  getPermalink,
  joinChannel,
  openDm,
  postEphemeral,
  postMessage,
  updateMessage,
} from "../server/messages.js";

const TOKEN = "xoxb-test";

interface Call {
  url: string;
  body: Record<string, unknown> | undefined;
  method: string;
  token: string | null;
}

interface RecordOptions {
  /** Per-URL response JSON. Keyed on the path after `/api/` (`chat.postMessage`, …). */
  byMethod: Record<string, Record<string, unknown>>;
  status?: number;
}

function recordFetch(opts: RecordOptions) {
  const calls: Call[] = [];
  const status = opts.status ?? 200;
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    const token = headers.authorization?.replace(/^Bearer\s+/, "") ?? null;
    const method = url.replace(/^https:\/\/slack\.com\/api\//, "");
    calls.push({ url, body, method, token });
    const data = opts.byMethod[method] ?? { ok: true };
    return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

describe("postMessage", () => {
  it("sends the channel, text, and unfurl=false by default", async () => {
    const { fetchImpl, calls } = recordFetch({ byMethod: { "chat.postMessage": { ok: true, ts: "1.2" } } });
    const attempt = await postMessage(TOKEN, { channel: "C1", text: "hi" }, { fetchImpl });
    expect(attempt.kind).toBe("ok");
    expect(calls[0]?.body).toEqual({ channel: "C1", text: "hi", unfurl_links: false, unfurl_media: false });
  });

  it("passes through blocks, thread_ts, and metadata when given", async () => {
    const { fetchImpl, calls } = recordFetch({ byMethod: { "chat.postMessage": { ok: true, ts: "1.2" } } });
    const blocks = [{ type: "section", text: { type: "mrkdwn", text: "x" } }];
    await postMessage(
      TOKEN,
      {
        channel: "C1",
        text: "hi",
        blocks,
        threadTs: "1700000000.000100",
        metadata: { event_type: "deploy", event_payload: { id: "abc" } },
      },
      { fetchImpl },
    );
    expect(calls[0]?.body).toEqual({
      channel: "C1",
      text: "hi",
      blocks,
      thread_ts: "1700000000.000100",
      metadata: { event_type: "deploy", event_payload: { id: "abc" } },
      unfurl_links: false,
      unfurl_media: false,
    });
  });

  it("omits blocks from the body when the array is empty (and absent entirely when not given)", async () => {
    const { fetchImpl, calls } = recordFetch({ byMethod: { "chat.postMessage": { ok: true, ts: "1.2" } } });
    await postMessage(TOKEN, { channel: "C1", text: "hi", blocks: [] }, { fetchImpl });
    // Empty `blocks` would be Slack `[]`; we drop it so the body stays minimal.
    expect(calls[0]?.body).toEqual({ channel: "C1", text: "hi", unfurl_links: false, unfurl_media: false });
  });

  it("sets unfurl=true when the caller asks for it", async () => {
    const { fetchImpl, calls } = recordFetch({ byMethod: { "chat.postMessage": { ok: true, ts: "1.2" } } });
    await postMessage(TOKEN, { channel: "C1", text: "hi", unfurl: true }, { fetchImpl });
    expect(calls[0]?.body).toEqual({ channel: "C1", text: "hi", unfurl_links: true, unfurl_media: true });
  });

  it("bearer-token headers every call", async () => {
    const { fetchImpl, calls } = recordFetch({ byMethod: { "chat.postMessage": { ok: true, ts: "1.2" } } });
    await postMessage(TOKEN, { channel: "C1", text: "hi" }, { fetchImpl });
    expect(calls[0]?.token).toBe(TOKEN);
  });

  it("returns the Slack-attempt shape on refusal (no throw)", async () => {
    const { fetchImpl } = recordFetch({ byMethod: { "chat.postMessage": { ok: false, error: "not_in_channel" } } });
    const attempt = await postMessage(TOKEN, { channel: "C1", text: "hi" }, { fetchImpl });
    expect(attempt.kind).toBe("refused");
    if (attempt.kind === "refused") expect(attempt.error).toBe("not_in_channel");
  });
});

describe("updateMessage", () => {
  it("carries channel/ts/text and the optional blocks/metadata", async () => {
    const { fetchImpl, calls } = recordFetch({ byMethod: { "chat.update": { ok: true, ts: "1.2" } } });
    const blocks = [{ type: "divider" }];
    await updateMessage(
      TOKEN,
      { channel: "C1", ts: "1700000000.000100", text: "edited", blocks, metadata: { event_type: "x", event_payload: {} } },
      { fetchImpl },
    );
    expect(calls[0]?.body).toEqual({
      channel: "C1",
      ts: "1700000000.000100",
      text: "edited",
      blocks,
      metadata: { event_type: "x", event_payload: {} },
    });
  });
});

describe("postEphemeral", () => {
  it("sets response_type: ephemeral and forwards thread_ts", async () => {
    const { fetchImpl, calls } = recordFetch({ byMethod: { "chat.postMessage": { ok: true, ts: "1.2" } } });
    await postEphemeral(TOKEN, { channel: "C1", user: "U1", text: "psst", threadTs: "1700000000.000100" }, { fetchImpl });
    expect(calls[0]?.body).toEqual({
      channel: "C1",
      user: "U1",
      text: "psst",
      response_type: "ephemeral",
      thread_ts: "1700000000.000100",
    });
  });
});

describe("getPermalink", () => {
  it("returns the permalink on ok", async () => {
    const { fetchImpl } = recordFetch({ byMethod: { "chat.getPermalink": { ok: true, permalink: "https://team.slack.com/archives/C1/p1" } } });
    await expect(getPermalink(TOKEN, "C1", "1.2", { fetchImpl })).resolves.toBe("https://team.slack.com/archives/C1/p1");
  });

  it("returns null on refusal", async () => {
    const { fetchImpl } = recordFetch({ byMethod: { "chat.getPermalink": { ok: false, error: "message_not_found" } } });
    await expect(getPermalink(TOKEN, "C1", "1.2", { fetchImpl })).resolves.toBeNull();
  });
});

describe("openDm", () => {
  it("returns the channel id from conversations.open { users }", async () => {
    const { fetchImpl } = recordFetch({ byMethod: { "conversations.open": { ok: true, channel: { id: "D999" } } } });
    await expect(openDm(TOKEN, "U1", { fetchImpl })).resolves.toBe("D999");
  });

  it("returns null when Slack refuses or the channel is missing", async () => {
    const { fetchImpl } = recordFetch({ byMethod: { "conversations.open": { ok: false, error: "cannot_dm_bot" } } });
    await expect(openDm(TOKEN, "U1", { fetchImpl })).resolves.toBeNull();
  });

  it("returns null when the response is ok but has no channel.id", async () => {
    const { fetchImpl } = recordFetch({ byMethod: { "conversations.open": { ok: true, channel: {} } } });
    await expect(openDm(TOKEN, "U1", { fetchImpl })).resolves.toBeNull();
  });
});

describe("joinChannel", () => {
  it("posts to conversations.join with the channel id", async () => {
    const { fetchImpl, calls } = recordFetch({ byMethod: { "conversations.join": { ok: true, channel: { id: "C1" } } } });
    const attempt = await joinChannel(TOKEN, "C1", { fetchImpl });
    expect(attempt.kind).toBe("ok");
    expect(calls[0]?.body).toEqual({ channel: "C1" });
  });
});

describe("findMessageByMetadata", () => {
  it("finds the matching message in the last 15 by default", async () => {
    const { fetchImpl, calls } = recordFetch({
      byMethod: {
        "conversations.history": {
          ok: true,
          messages: [
            { ts: "3", metadata: { event_type: "deploy", event_payload: { id: "later" } } },
            { ts: "2", metadata: { event_type: "deploy", event_payload: { id: "abc" } } },
            { ts: "1" },
          ],
        },
      },
    });
    const found = await findMessageByMetadata(TOKEN, "C1", "deploy", (p) => p["id"] === "abc", { fetchImpl });
    expect(found).toEqual({ ts: "2", payload: { id: "abc" } });
    expect(calls[0]?.body).toEqual({ channel: "C1", limit: 15, include_all_metadata: true });
  });

  it("honors a custom limit", async () => {
    const { fetchImpl, calls } = recordFetch({
      byMethod: { "conversations.history": { ok: true, messages: [] } },
    });
    await findMessageByMetadata(TOKEN, "C1", "deploy", () => true, { fetchImpl, limit: 5 });
    expect(calls[0]?.body).toEqual({ channel: "C1", limit: 5, include_all_metadata: true });
  });

  it("returns null when no message matches", async () => {
    const { fetchImpl } = recordFetch({
      byMethod: {
        "conversations.history": {
          ok: true,
          messages: [{ ts: "1", metadata: { event_type: "deploy", event_payload: { id: "x" } } }],
        },
      },
    });
    await expect(findMessageByMetadata(TOKEN, "C1", "deploy", (p) => p["id"] === "nope", { fetchImpl })).resolves.toBeNull();
  });

  it("returns null on refusal (rate-limited, missing scope, …)", async () => {
    const { fetchImpl } = recordFetch({ byMethod: { "conversations.history": { ok: false, error: "ratelimited" } } });
    await expect(findMessageByMetadata(TOKEN, "C1", "deploy", () => true, { fetchImpl })).resolves.toBeNull();
  });
});