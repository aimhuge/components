import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { verifySlackRequest, SLACK_REPLAY_WINDOW_S } from "../server/verify.js";

const SECRET = "shhh-its-a-secret";
const NOW_S = 1_700_000_000;

const sign = (rawBody: string, timestamp: string, secret = SECRET) =>
  "v0=" + crypto.createHmac("sha256", secret).update(`v0:${timestamp}:${rawBody}`).digest("hex");

describe("verifySlackRequest", () => {
  it("accepts a correctly signed body", () => {
    const body = '{"event":"test"}';
    const ts = String(NOW_S);
    expect(verifySlackRequest({ rawBody: body, timestamp: ts, signature: sign(body, ts), signingSecret: SECRET, nowS: NOW_S })).toBe(true);
  });

  it("rejects a one-byte change to the body", () => {
    const body = '{"event":"test"}';
    const ts = String(NOW_S);
    const sig = sign(body, ts);
    expect(verifySlackRequest({ rawBody: body + " ", timestamp: ts, signature: sig, signingSecret: SECRET, nowS: NOW_S })).toBe(false);
  });

  it("rejects a wrong secret", () => {
    const body = '{"event":"test"}';
    const ts = String(NOW_S);
    expect(verifySlackRequest({ rawBody: body, timestamp: ts, signature: sign(body, ts, "other-secret"), signingSecret: SECRET, nowS: NOW_S })).toBe(false);
  });

  it("rejects a timestamp 301 seconds old", () => {
    const body = '{"event":"test"}';
    const oldTs = String(NOW_S - SLACK_REPLAY_WINDOW_S - 1);
    expect(verifySlackRequest({ rawBody: body, timestamp: oldTs, signature: sign(body, oldTs), signingSecret: SECRET, nowS: NOW_S })).toBe(false);
  });

  it("rejects a timestamp 301 seconds in the future", () => {
    const body = '{"event":"test"}';
    const futureTs = String(NOW_S + SLACK_REPLAY_WINDOW_S + 1);
    expect(verifySlackRequest({ rawBody: body, timestamp: futureTs, signature: sign(body, futureTs), signingSecret: SECRET, nowS: NOW_S })).toBe(false);
  });

  it("accepts a timestamp exactly at the boundary (299s old)", () => {
    const body = '{"event":"test"}';
    const ts = String(NOW_S - (SLACK_REPLAY_WINDOW_S - 1));
    expect(verifySlackRequest({ rawBody: body, timestamp: ts, signature: sign(body, ts), signingSecret: SECRET, nowS: NOW_S })).toBe(true);
  });

  it("rejects when the timestamp header is missing", () => {
    expect(verifySlackRequest({ rawBody: "x", timestamp: null, signature: "v0=00", signingSecret: SECRET, nowS: NOW_S })).toBe(false);
  });

  it("rejects when the signature header is missing", () => {
    expect(verifySlackRequest({ rawBody: "x", timestamp: String(NOW_S), signature: null, signingSecret: SECRET, nowS: NOW_S })).toBe(false);
  });

  it("rejects when the timestamp isn't an integer", () => {
    expect(verifySlackRequest({ rawBody: "x", timestamp: "abc", signature: "v0=00", signingSecret: SECRET, nowS: NOW_S })).toBe(false);
    expect(verifySlackRequest({ rawBody: "x", timestamp: "1700000000.5", signature: "v0=00", signingSecret: SECRET, nowS: NOW_S })).toBe(false);
    expect(verifySlackRequest({ rawBody: "x", timestamp: "", signature: "v0=00", signingSecret: SECRET, nowS: NOW_S })).toBe(false);
  });

  it("returns false (does not throw) when the signature length is wrong", () => {
    // `timingSafeEqual` throws on a length mismatch; verify must swallow it
    // by length-checking first. The forged signature is a single character
    // shorter than the real v0=... hex digest.
    const body = '{"event":"test"}';
    const ts = String(NOW_S);
    expect(verifySlackRequest({ rawBody: body, timestamp: ts, signature: "v0=deadbeef", signingSecret: SECRET, nowS: NOW_S })).toBe(false);
  });
});