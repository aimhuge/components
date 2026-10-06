/** Slack's replay window, in seconds. Five minutes, per Slack's own guidance. */
export declare const SLACK_REPLAY_WINDOW_S = 300;
export interface VerifyInput {
    rawBody: string;
    timestamp: string | null;
    signature: string | null;
    signingSecret: string;
    /** Override `Date.now()/1000` for tests. */
    nowS?: number;
}
/**
 * True iff `signature` is `v0=<hex HMAC-SHA256(signingSecret, v0:timestamp:rawBody)>`
 * and `timestamp` is within ±SLACK_REPLAY_WINDOW_S of `nowS` (defaults to now).
 *
 * Returns false (never throws) when:
 *   - timestamp or signature is missing,
 *   - timestamp isn't an integer string of seconds,
 *   - the replay window is breached,
 *   - the signature's length doesn't match the expected digest length
 *     (a length mismatch never reaches `timingSafeEqual`, which throws).
 */
export declare function verifySlackRequest(input: VerifyInput): boolean;
