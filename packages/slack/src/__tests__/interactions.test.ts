import { describe, expect, it, vi } from "vitest";
import { findAction, inputValue, parseInteractionBody, replaceMessage, respondTo, whisper } from "../server/interactions";

const RESPONSE_URL = "https://hooks.slack.com/actions/T1/123/abc";

function recorder(): { replies: Array<Record<string, unknown>>; fetchImpl: typeof fetch } {
  const replies: Array<Record<string, unknown>> = [];
  const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
    replies.push(JSON.parse(String(init?.body)));
    return new Response("ok");
  }) as unknown as typeof fetch;
  return { replies, fetchImpl };
}

describe("parseInteractionBody", () => {
  it("parses the `payload` field from a form-encoded body", () => {
    const payload = { type: "block_actions", team: { id: "T1" }, user: { id: "U1" }, response_url: RESPONSE_URL };
    const raw = `payload=${encodeURIComponent(JSON.stringify(payload))}`;
    expect(parseInteractionBody(raw)).toEqual(payload);
  });

  it("returns null when the body has no `payload` field", () => {
    expect(parseInteractionBody("foo=bar")).toBeNull();
  });

  it("returns null when `payload` isn't valid JSON", () => {
    expect(parseInteractionBody("payload={not-json")).toBeNull();
  });
});

describe("findAction", () => {
  it("returns the action whose action_id matches", () => {
    const payload = {
      actions: [
        { action_id: "other", value: "1" },
        { action_id: "target", value: "2", block_id: "b" },
      ],
    };
    expect(findAction(payload, "target")).toEqual({ action_id: "target", value: "2", block_id: "b" });
  });

  it("returns null when nothing matches", () => {
    expect(findAction({ actions: [{ action_id: "x" }] }, "y")).toBeNull();
    expect(findAction({}, "y")).toBeNull();
  });
});

describe("inputValue", () => {
  it("returns the first element's value in state.values[blockId], trimmed", () => {
    expect(inputValue({ state: { values: { url: { url_input: { value: "  https://x.co/1  " } } } } }, "url")).toBe(
      "https://x.co/1",
    );
  });

  it("returns an empty string when the block is missing", () => {
    expect(inputValue({}, "url")).toBe("");
    expect(inputValue({ state: { values: { other: { x: { value: "y" } } } } }, "url")).toBe("");
  });

  it("returns an empty string when the value is null", () => {
    expect(inputValue({ state: { values: { url: { x: { value: null } } } } }, "url")).toBe("");
  });
});

describe("respondTo", () => {
  it("POSTs the body to the response_url and returns true on 2xx", async () => {
    const { replies, fetchImpl } = recorder();
    const ok = await respondTo(RESPONSE_URL, { text: "hi" }, { fetchImpl });
    expect(ok).toBe(true);
    expect(replies).toEqual([{ text: "hi" }]);
  });

  it("returns false and never throws on a non-2xx", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    await expect(respondTo(RESPONSE_URL, { text: "x" }, { fetchImpl })).resolves.toBe(false);
  });

  it("returns false and never throws on a network failure", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => {
      throw new Error("boom");
    }) as unknown as typeof fetch;
    await expect(respondTo(RESPONSE_URL, { text: "x" }, { fetchImpl })).resolves.toBe(false);
  });
});

describe("whisper", () => {
  it("sends an ephemeral message that does not replace the original", async () => {
    const { replies, fetchImpl } = recorder();
    await whisper(RESPONSE_URL, "only me", { fetchImpl });
    expect(replies[0]).toMatchObject({ response_type: "ephemeral", replace_original: false, text: "only me" });
  });
});

describe("replaceMessage", () => {
  it("edits the original in place, with optional blocks", async () => {
    const { replies, fetchImpl } = recorder();
    await replaceMessage(
      RESPONSE_URL,
      { text: "done", blocks: [{ type: "section", text: { type: "mrkdwn", text: "done" } }] },
      { fetchImpl },
    );
    expect(replies[0]).toMatchObject({
      replace_original: true,
      text: "done",
      blocks: [{ type: "section", text: { type: "mrkdwn", text: "done" } }],
    });
  });

  it("omits blocks when none were passed", async () => {
    const { replies, fetchImpl } = recorder();
    await replaceMessage(RESPONSE_URL, { text: "done" }, { fetchImpl });
    expect(replies[0]).not.toHaveProperty("blocks");
  });
});