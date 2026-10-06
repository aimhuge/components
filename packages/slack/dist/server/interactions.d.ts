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
export interface InteractionPayload {
    type?: string;
    team?: {
        id?: string;
    };
    user?: {
        id?: string;
    };
    response_url?: string;
    trigger_id?: string;
    actions?: Array<{
        action_id?: string;
        value?: string;
        block_id?: string;
    }>;
    state?: {
        values?: Record<string, Record<string, {
            value?: string | null;
        }>>;
    };
    message?: {
        ts?: string;
        text?: string;
        blocks?: Array<Record<string, unknown>>;
    };
    channel?: {
        id?: string;
    };
    container?: {
        channel_id?: string;
        message_ts?: string;
    };
}
export interface InteractionDeps {
    fetchImpl?: typeof fetch;
}
/**
 * Parse the body Slack POSTs. Slack sends the payload as
 * `application/x-www-form-urlencoded` with a single field `payload` whose
 * value is the JSON. Returns null on a bad body.
 */
export declare function parseInteractionBody(rawBody: string): InteractionPayload | null;
/** The action in `actions` whose `action_id` matches, or null. */
export declare function findAction(payload: InteractionPayload, actionId: string): {
    action_id?: string;
    value?: string;
} | null;
/**
 * The first input element's value in `state.values[blockId]`, trimmed, or
 * `""` when the block is absent. Slack puts at most one element per input
 * block in a message, so the first entry is the answer.
 */
export declare function inputValue(payload: InteractionPayload, blockId: string): string;
/**
 * POST `body` to `response_url`. Returns true on a 2xx. Never throws — a
 * lost reply is logged, not retried. Times out at 10 seconds; Slack's URL
 * can be slow and the 30-minute window makes one retry cheap.
 */
export declare function respondTo(responseUrl: string, body: Record<string, unknown>, deps?: InteractionDeps): Promise<boolean>;
/** Speak to the clicker only (`response_type: "ephemeral"`). */
export declare function whisper(responseUrl: string, text: string, deps?: InteractionDeps): Promise<boolean>;
/** Edit the clicked message in place (`replace_original: true`). */
export declare function replaceMessage(responseUrl: string, message: {
    text: string;
    blocks?: Array<Record<string, unknown>>;
}, deps?: InteractionDeps): Promise<boolean>;
