/**
 * Tests for the incoming-webhook poster: `postWebhook` and `fireWebhook`.
 * Ported from BlastCP's `admin-feed.test.ts` (the guard + poster tests; the
 * `formatAdminEvent` cases are app-specific and live with the formatter).
 */
import { describe, expect, it, vi } from "vitest";
import { fireWebhook, postWebhook } from "../server/webhook.js";

const URL = "https://hooks.slack.com/services/T000/B000/XXXX";

describe("postWebhook", () => {
  it("posts the text as JSON and returns true on 2xx", async () => {
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
    const ok = await postWebhook(URL, { text: "hello" }, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(ok).toBe(true);
    const [calledUrl, init] = (fetchImpl.mock.calls[0] ?? []) as unknown as [string, RequestInit];
    expect(calledUrl).toBe(URL);
    expect(JSON.parse(String(init.body))).toEqual({ text: "hello" });
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
  });

  it("includes blocks in the body when given", async () => {
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
    const blocks = [{ type: "section", text: { type: "mrkdwn", text: "x" } }];
    await postWebhook(URL, { text: "hello", blocks }, { fetchImpl: fetchImpl as unknown as typeof fetch });
    const [, init] = (fetchImpl.mock.calls[0] ?? []) as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ text: "hello", blocks });
  });

  it("returns false (does not throw) when Slack is down", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(postWebhook(URL, { text: "hi" }, { fetchImpl: fetchImpl as unknown as typeof fetch })).resolves.toBe(false);
    expect(warn).toHaveBeenCalled();
    // The URL must never appear in the log — it's a bearer secret.
    const calls = warn.mock.calls.flat().map((c) => String(c));
    expect(calls.some((c) => c.includes(URL))).toBe(false);
  });

  it("returns false on a non-2xx and warns with the status (no URL)", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(postWebhook(URL, { text: "hi" }, { fetchImpl: fetchImpl as unknown as typeof fetch })).resolves.toBe(false);
    const calls = warn.mock.calls.flat().map((c) => String(c));
    expect(calls.some((c) => c.includes("500"))).toBe(true);
    expect(calls.some((c) => c.includes(URL))).toBe(false);
  });

  it("times out (false, no throw) when the request hangs", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      // The default 5s timeout would be expensive; honor the shorter one.
      const signal = init?.signal as AbortSignal | undefined;
      return await new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("aborted", "TimeoutError")));
        setTimeout(() => reject(new DOMException("aborted", "TimeoutError")), 50);
      });
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ok = await postWebhook(URL, { text: "hi" }, { fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 10 });
    expect(ok).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});

describe("fireWebhook", () => {
  it("sends nothing at all when the feed is off (url is null)", async () => {
    const fetchImpl = vi.fn();
    fireWebhook(null, () => ({ text: "hi" }), { fetchImpl: fetchImpl as unknown as typeof fetch });
    // The function returns synchronously; give the microtask queue a turn
    // and then assert no call ever happened.
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("runs build() and posts the result", async () => {
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
    const build = vi.fn(() => ({ text: "hello" }));
    fireWebhook(URL, build, { fetchImpl: fetchImpl as unknown as typeof fetch });
    await new Promise((r) => setTimeout(r, 0));
    expect(build).toHaveBeenCalledOnce();
    const [calledUrl, init] = (fetchImpl.mock.calls[0] ?? []) as unknown as [string, RequestInit];
    expect(calledUrl).toBe(URL);
    expect(JSON.parse(String(init.body))).toEqual({ text: "hello" });
  });

  it("does nothing when build() returns null", async () => {
    const fetchImpl = vi.fn();
    fireWebhook(URL, () => null, { fetchImpl: fetchImpl as unknown as typeof fetch });
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("awaits a Promise from build()", async () => {
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
    fireWebhook(
      URL,
      async () => {
        await new Promise((r) => setTimeout(r, 5));
        return { text: "async hello" };
      },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("swallows every error (build throws, fetch throws, post returns false)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    // build throws.
    fireWebhook(URL, () => {
      throw new Error("db down");
    });
    // post throws.
    fireWebhook(URL, () => ({ text: "hi" }), { fetchImpl: vi.fn(async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch });
    // post returns false (no throw) — still no caller-visible error.
    fireWebhook(URL, () => ({ text: "hi" }), { fetchImpl: vi.fn(async () => new Response("no", { status: 500 })) as unknown as typeof fetch });

    await new Promise((r) => setTimeout(r, 20));
    // No throw surfaced; the warnings were console-only.
    expect(warn).toHaveBeenCalled();
    // The URL is still not in any log.
    const calls = warn.mock.calls.flat().map((c) => String(c));
    expect(calls.some((c) => c.includes(URL))).toBe(false);
  });
});