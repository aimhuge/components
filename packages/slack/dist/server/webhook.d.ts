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
export interface PostWebhookDeps {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
}
/**
 * POST one incoming-webhook message. Returns true on 2xx, false on a network
 * error, a timeout, or a non-2xx response. Never throws.
 */
export declare function postWebhook(url: string, payload: {
    text: string;
    blocks?: Block[];
}, deps?: PostWebhookDeps): Promise<boolean>;
/**
 * Fire-and-forget: when `url` is null (the feed is off), do nothing. When it
 * is set, run `build` (which may read a DB to compose the payload), post the
 * result, and swallow every error. Returns immediately; the caller doesn't
 * await — a Slack outage must not stall the writer.
 */
export declare function fireWebhook(url: string | null, build: () => {
    text: string;
    blocks?: Block[];
} | null | Promise<{
    text: string;
    blocks?: Block[];
} | null>, deps?: {
    fetchImpl?: typeof fetch;
}): void;
