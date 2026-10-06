import { describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { firstDelivery, isPersonMessage, isUninstallEvent, messageText, readSlackRequest } from "../server/events";

const SECRET = "shhh-its-a-secret";
const NOW_S = 1_700_000_000;

const sign = (rawBody: string, timestamp: string, secret = SECRET): string =>
  "v0=" + crypto.createHmac("sha256", secret).update(`v0:${timestamp}:${rawBody}`).digest("hex");

describe("isPersonMessage", () => {
  const BOT = "UBOT";
  it("an @mention or a DM from a person", () => {
    expect(isPersonMessage({ type: "app_mention", user: "U1" }, BOT)).toBe(true);
    expect(isPersonMessage({ type: "message", channel_type: "im", user: "U1" }, BOT)).toBe(true);
  });

  it("never the bot's own replies, other bots, edits, or channel chatter", () => {
    expect(isPersonMessage({ type: "message", channel_type: "im", user: BOT }, BOT)).toBe(false);
    expect(isPersonMessage({ type: "message", channel_type: "im", user: "U1", bot_id: "B1" }, BOT)).toBe(false);
    expect(isPersonMessage({ type: "message", channel_type: "im", user: "U1", subtype: "message_changed" }, BOT)).toBe(false);
    expect(isPersonMessage({ type: "message", channel_type: "channel", user: "U1" }, BOT)).toBe(false);
  });
});

describe("messageText", () => {
  it("takes the bot's mention out and keeps everyone else's", () => {
    expect(messageText("<@UBOT> draft a post for <@U2>  please", "UBOT")).toBe("draft a post for <@U2> please");
    expect(messageText("<@UBOT|blastcp> hi", "UBOT")).toBe("hi");
  });
});

describe("isUninstallEvent", () => {
  it("is true for app_uninstalled and tokens_revoked", () => {
    expect(isUninstallEvent({ type: "app_uninstalled" })).toBe(true);
    expect(isUninstallEvent({ type: "tokens_revoked" })).toBe(true);
  });

  it("is false for everything else", () => {
    expect(isUninstallEvent({ type: "message" })).toBe(false);
    expect(isUninstallEvent(undefined)).toBe(false);
  });
});

describe("firstDelivery — Slack's retries stop at the receipt", () => {
  const service = (error: { code?: string; message: string } | null): SupabaseClient =>
    ({ from: () => ({ insert: async () => ({ error }) }) }) as unknown as SupabaseClient;

  it("is true the first time", async () => expect(await firstDelivery(service(null), "Ev1")).toBe(true));
  it("is false for a duplicate", async () =>
    expect(await firstDelivery(service({ code: "23505", message: "duplicate" }), "Ev1")).toBe(false));
  it("still answers when the receipt can't be written", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await firstDelivery(service({ code: "42P01", message: "missing table" }), "Ev1")).toBe(true);
  });
});

describe("readSlackRequest", () => {
  const wrap = (rawBody: string, overrides: { timestamp?: string; signature?: string | null } = {}) => {
    const ts = overrides.timestamp ?? String(NOW_S);
    const sig = overrides.signature === null ? null : (overrides.signature ?? sign(rawBody, ts));
    return readSlackRequest({ rawBody, timestamp: ts, signature: sig, signingSecret: SECRET, nowS: NOW_S });
  };

  it("is unverified when the signature is wrong (even if the body parses fine)", () => {
    const body = JSON.stringify({ type: "event_callback", event_id: "Ev1", event: { type: "message" } });
    const ts = String(NOW_S);
    expect(readSlackRequest({ rawBody: body, timestamp: ts, signature: sign(body, ts, "wrong-secret"), signingSecret: SECRET, nowS: NOW_S })).toEqual({
      kind: "unverified",
    });
  });

  it("is unverified FIRST, even when the body is bad JSON", () => {
    expect(readSlackRequest({ rawBody: "{not json", timestamp: String(NOW_S), signature: "wrong", signingSecret: SECRET, nowS: NOW_S })).toEqual({
      kind: "unverified",
    });
  });

  it("returns the challenge for url_verification", () => {
    const body = JSON.stringify({ type: "url_verification", challenge: "abc123" });
    expect(wrap(body)).toEqual({ kind: "challenge", challenge: "abc123" });
  });

  it("returns the envelope for event_callback", () => {
    const body = JSON.stringify({
      type: "event_callback",
      team_id: "T1",
      event_id: "Ev1",
      event: { type: "message", user: "U1", text: "hi", channel: "C1", ts: "100.1", channel_type: "im" },
    });
    expect(wrap(body)).toEqual({
      kind: "event",
      envelope: {
        type: "event_callback",
        team_id: "T1",
        event_id: "Ev1",
        event: { type: "message", user: "U1", text: "hi", channel: "C1", ts: "100.1", channel_type: "im" },
      },
    });
  });

  it("returns bad_json when verified but the body won't parse", () => {
    expect(wrap("{not json")).toEqual({ kind: "bad_json" });
  });

  it("returns other.type for payloads that aren't events or url_verification", () => {
    const body = JSON.stringify({ type: "block_actions", user: { id: "U1" } });
    expect(wrap(body)).toEqual({ kind: "other", type: "block_actions" });
  });
});