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
const API = "https://slack.com/api";
export const SLACK_TIMEOUT_MS = 15_000;
/** Call one Web API method. Never throws. */
export async function callSlack(method, opts = {}) {
    const headers = {};
    if (opts.token)
        headers.authorization = `Bearer ${opts.token}`;
    let body;
    if (opts.form) {
        body = new URLSearchParams(opts.form);
        headers["content-type"] = "application/x-www-form-urlencoded";
    }
    else if (opts.body) {
        body = JSON.stringify(opts.body);
        headers["content-type"] = "application/json; charset=utf-8";
    }
    let res;
    try {
        res = await (opts.fetchImpl ?? fetch)(`${API}/${method}`, {
            method: "POST",
            headers,
            body,
            signal: AbortSignal.timeout(opts.timeoutMs ?? SLACK_TIMEOUT_MS),
        });
    }
    catch (err) {
        const name = err instanceof Error ? err.name : "";
        return {
            kind: "unreached",
            timedOut: name === "TimeoutError" || name === "AbortError",
            message: err instanceof Error ? err.message : String(err),
        };
    }
    const retryAfter = Number(res.headers.get("retry-after"));
    const retryAfterS = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null;
    let data = {};
    try {
        const parsed = await res.json();
        if (parsed && typeof parsed === "object")
            data = parsed;
    }
    catch {
        // A 5xx is often HTML. The status says enough.
    }
    if (res.ok && data.ok === true)
        return { kind: "ok", data };
    const error = typeof data.error === "string" ? data.error : res.status === 429 ? "ratelimited" : `http_${res.status}`;
    return { kind: "refused", status: res.status, error, retryAfterS, data };
}
/** Slack's errors that mean the token itself is dead: reconnect, don't retry. */
const AUTH_ERRORS = new Set(["invalid_auth", "not_authed", "token_revoked", "token_expired", "account_inactive", "no_permission"]);
export const isSlackAuthError = (error) => AUTH_ERRORS.has(error);
/** A string field off a Slack response, or null. */
export function str(obj, key) {
    if (!obj || typeof obj !== "object")
        return null;
    const v = obj[key];
    return typeof v === "string" && v ? v : null;
}
