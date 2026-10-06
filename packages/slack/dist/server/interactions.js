/**
 * Slack's interactivity payloads. The route has already verified the request
 * and answered Slack; this runs in `after()`.
 *
 * Why an `InteractionPayload` helper set and not a full handler? Each app
 * decides what a click MEANS — "Mark published" in one app, "Approve" in
 * another. The bits every app needs, though, are the same:
 *
 *   - `parseInteractionBody`: the body is form-encoded, the JSON lives in
 *     the `payload` field (Slack's wire format).
 *   - `findAction` / `inputValue`: the clicks and the input fields a
 *     `state.values[…]` block carries.
 *   - `respondTo` / `whisper` / `replaceMessage`: every answer goes back
 *     through the payload's `response_url`. It can edit the message that
 *     was clicked (`replace_original`) or say something only the clicker
 *     sees (`response_type: "ephemeral"`), and needs no token. The URL
 *     lives 30 minutes; the call has no `trigger_id` deadline.
 *
 * Why an input block in the message beats a modal. A modal would need
 * `views.open` inside the 3 seconds a click's `trigger_id` lives, before
 * the route may answer — this path has no deadline but the `response_url`'s
 * 30 minutes. So apps that want both a button and a free-form value put
 * the input in the message, where one click delivers both.
 */
const TEN_SECONDS = 10_000;
/**
 * Parse the body Slack POSTs. Slack sends the payload as
 * `application/x-www-form-urlencoded` with a single field `payload` whose
 * value is the JSON. Returns null on a bad body.
 */
export function parseInteractionBody(rawBody) {
    const params = new URLSearchParams(rawBody);
    const payload = params.get("payload");
    if (!payload)
        return null;
    try {
        const parsed = JSON.parse(payload);
        if (!parsed || typeof parsed !== "object")
            return null;
        return parsed;
    }
    catch {
        return null;
    }
}
/** The action in `actions` whose `action_id` matches, or null. */
export function findAction(payload, actionId) {
    return payload.actions?.find((a) => a.action_id === actionId) ?? null;
}
/**
 * The first input element's value in `state.values[blockId]`, trimmed, or
 * `""` when the block is absent. Slack puts at most one element per input
 * block in a message, so the first entry is the answer.
 */
export function inputValue(payload, blockId) {
    const block = payload.state?.values?.[blockId];
    if (!block)
        return "";
    const first = Object.values(block)[0];
    return (first?.value ?? "").trim();
}
/**
 * POST `body` to `response_url`. Returns true on a 2xx. Never throws — a
 * lost reply is logged, not retried. Times out at 10 seconds; Slack's URL
 * can be slow and the 30-minute window makes one retry cheap.
 */
export async function respondTo(responseUrl, body, deps = {}) {
    try {
        const res = await (deps.fetchImpl ?? fetch)(responseUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(TEN_SECONDS),
        });
        if (!res.ok) {
            console.warn(`[slack/interactions] response_url refused: HTTP ${res.status}`);
            return false;
        }
        return true;
    }
    catch (err) {
        console.warn(`[slack/interactions] response_url failed: ${err instanceof Error ? err.message : String(err)}`);
        return false;
    }
}
/** Speak to the clicker only (`response_type: "ephemeral"`). */
export function whisper(responseUrl, text, deps = {}) {
    return respondTo(responseUrl, { response_type: "ephemeral", replace_original: false, text }, deps);
}
/** Edit the clicked message in place (`replace_original: true`). */
export function replaceMessage(responseUrl, message, deps = {}) {
    return respondTo(responseUrl, { replace_original: true, text: message.text, ...(message.blocks ? { blocks: message.blocks } : {}) }, deps);
}
