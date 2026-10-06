/**
 * The one fetch to Slack's Web API. Every Slack call an app makes — the
 * OAuth exchange, publishing, the client's replies, the admin feed —
 * goes through `callSlack`, so timeouts, rate limits and Slack's error
 * shape are read in exactly one place.
 *
 * Slack's error shape: almost every failure is HTTP 200 with
 * `{ ok: false, error: "channel_not_found" }`. A 429 carries `Retry-After`
 * (seconds). A 5xx is Slack itself. A thrown fetch means we never got an
 * answer — for a WRITE that is the ambiguity the caller decides what it
 * means (publish: never retried; the events code: outcome dependent).
 *
 * Tokens are never logged: errors carry Slack's error code and a status only.
 */
export declare const SLACK_TIMEOUT_MS = 15000;
export type SlackAttempt = 
/** Slack answered `ok: true`. `data` is the whole JSON body. */
{
    kind: "ok";
    data: Record<string, unknown>;
}
/** Slack answered, and said no. `error` is Slack's code (`invalid_auth`, …). */
 | {
    kind: "refused";
    status: number;
    error: string;
    retryAfterS: number | null;
    data: Record<string, unknown>;
}
/** No answer: the request threw or timed out. `timedOut` tells the two apart. */
 | {
    kind: "unreached";
    timedOut: boolean;
    message: string;
};
export interface CallOptions {
    /** A bot token (`xoxb-…`). Omitted for `oauth.v2.access`, which uses `form`. */
    token?: string;
    /** JSON body. Sent as `application/json; charset=utf-8`. */
    body?: Record<string, unknown>;
    /** Form body instead of JSON — `oauth.v2.access` accepts only this. */
    form?: Record<string, string>;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
}
/** Call one Web API method. Never throws. */
export declare function callSlack(method: string, opts?: CallOptions): Promise<SlackAttempt>;
export declare const isSlackAuthError: (error: string) => boolean;
/** A string field off a Slack response, or null. */
export declare function str(obj: unknown, key: string): string | null;
