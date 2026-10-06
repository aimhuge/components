const DEFAULT_TIMEOUT_MS = 5_000;
/**
 * POST one incoming-webhook message. Returns true on 2xx, false on a network
 * error, a timeout, or a non-2xx response. Never throws.
 */
export async function postWebhook(url, payload, deps = {}) {
    const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    try {
        const res = await (deps.fetchImpl ?? fetch)(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload.blocks && payload.blocks.length ? payload : { text: payload.text }),
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok)
            console.warn(`[slack/webhook] non-2xx response: HTTP ${res.status}`);
        return res.ok;
    }
    catch (err) {
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
export function fireWebhook(url, build, deps = {}) {
    if (!url)
        return;
    void (async () => {
        try {
            const payload = await build();
            if (!payload)
                return;
            await postWebhook(url, payload, deps);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`[slack/webhook] build failed: ${message}`);
        }
    })();
}
