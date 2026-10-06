/**
 * Slack's request signature verification. The header Slack sends on every
 * event is `X-Slack-Signature: v0=<hex>` where the hex is HMAC-SHA256 of
 * `v0:{timestamp}:{rawBody}` keyed by `SLACK_SIGNING_SECRET` (NOT the OAuth
 * client secret — see `config.ts`).
 *
 * Two things this guards against, both deliberately:
 *   1. A forger who doesn't know the signing secret can't craft a header.
 *      The compare is constant-time so a probing attacker can't learn bytes.
 *   2. A captured-and-replayed request is refused by the timestamp window:
 *      |now - timestamp| > 300s ⇒ false. Slack's own clock-skew guidance is
 *      five minutes; we use the same.
 *
 * Pure: the caller hands in `nowS`, so this is fully testable without mocking
 * the clock or `Date`. Server-only: imports `node:crypto`.
 *
 * Design: docs/architecture/slack.md § Verification.
 */
import crypto from "node:crypto";

/** Slack's replay window, in seconds. Five minutes, per Slack's own guidance. */
export const SLACK_REPLAY_WINDOW_S = 300;

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
export function verifySlackRequest(input: VerifyInput): boolean {
  const { rawBody, timestamp, signature, signingSecret } = input;
  if (!timestamp || !signature) return false;
  // Slack's timestamp is an integer string of seconds-since-epoch. Reject
  // anything else (NaN, decimal, sign, whitespace, empty) up front so we
  // never feed a junk value to the window check.
  if (!/^-?\d+$/.test(timestamp)) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const nowS = input.nowS ?? Math.floor(Date.now() / 1000);
  if (Math.abs(nowS - ts) > SLACK_REPLAY_WINDOW_S) return false;

  const expected = "v0=" + crypto.createHmac("sha256", signingSecret).update(`v0:${timestamp}:${rawBody}`).digest("hex");

  // `timingSafeEqual` requires equal-length buffers and throws on mismatch.
  // A forged signature of the wrong length is a refusal, not a 500.
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(signature);
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}