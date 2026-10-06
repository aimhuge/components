/**
 * Incoming-webhook poster. Used both ways an app posts to Slack without a
 * bot token:
 *
 *   - per-workspace feeds (Settings → Slack): the customer's channel of choice.
 *   - the staff / admin feed: the team's own Slack, configured by env.
 *
 * The webhook URL is a bearer secret — anyone holding it can post — so logs
 * carry the status code or error message only, never the URL, and the URL
 * itself never round-trips through the typed function surface.
 *
 * The contract: a network error, a timeout, or a non-2xx are all `false`,
 * never a throw. Callers on a hot path do `void postWebhook(...).catch(...)`
 * and move on — a Slack outage must not fail (or slow) the write that
 * triggered it. 5s cap so a hung webhook can never stall the writer.
 */
import type { Block } from "./messages.js";

const DEFAULT_TIMEOUT_MS = 5_000;

export interface PostWebhookDeps {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * POST one incoming-webhook message. Returns true on 2xx, false on a network
 * error, a timeout, or a non-2xx response. Never throws.
 */
export async function postWebhook(url: string, payload: { text: string; blocks?: Block[] }, deps: PostWebhookDeps = {}): Promise<boolean> {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    const res = await (deps.fetchImpl ?? fetch)(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload.blocks && payload.blocks.length ? payload : { text: payload.text }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) console.warn(`[slack/webhook] non-2xx response: HTTP ${res.status}`);
    return res.ok;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[slack/webhook] request failed: ${message}`);
    return false;
  }
}

/**
 * Fire-and-forget: when `url` is null (the feed is off), do nothing. When it
 * is set, run `build` (which may read a DB to compose the payload), post the
 * result, and swallow every error. Returns immediately; the caller doesn't
 * await — a Slack outage must not stall the writer.
 */
export function fireWebhook(
  url: string | null,
  build: () => { text: string; blocks?: Block[] } | null | Promise<{ text: string; blocks?: Block[] } | null>,
  deps: { fetchImpl?: typeof fetch } = {},
): void {
  if (!url) return;
  void (async () => {
    try {
      const payload = await build();
      if (!payload) return;
      await postWebhook(url, payload, deps);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[slack/webhook] build failed: ${message}`);
    }
  })();
}