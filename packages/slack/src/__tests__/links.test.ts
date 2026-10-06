import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { fakeSupabase, type FakeSupabase } from "./fake-supabase";
import {
  LINK_TOKEN_TTL_MS,
  linkSlackUser,
  linkUrl,
  linksForUser,
  linkedUserId,
  signLinkToken,
  verifyLinkToken,
} from "../server/links.js";

const SECRET = "shhh-its-a-secret";
const NOW_MS = 1_700_000_000_000;
const FUTURE_MS = NOW_MS + 60_000;
const USER = "11111111-2222-3333-4444-555555555555";

const as = (db: FakeSupabase) => db as unknown as SupabaseClient;

describe("signLinkToken / verifyLinkToken", () => {
  it("round-trips a token signed at a known moment", () => {
    const token = signLinkToken({ teamId: "T123", slackUserId: "U456", teamName: "Acme" }, SECRET, NOW_MS);
    const got = verifyLinkToken(token, SECRET, NOW_MS);
    expect(got).toEqual({ teamId: "T123", slackUserId: "U456", teamName: "Acme" });
  });

  it("preserves a null teamName", () => {
    const token = signLinkToken({ teamId: "T123", slackUserId: "U456", teamName: null }, SECRET, NOW_MS);
    const got = verifyLinkToken(token, SECRET, NOW_MS);
    expect(got).toEqual({ teamId: "T123", slackUserId: "U456", teamName: null });
  });

  it("accepts an enterprise team id (E…)", () => {
    const token = signLinkToken({ teamId: "E123", slackUserId: "U456" }, SECRET, NOW_MS);
    const got = verifyLinkToken(token, SECRET, NOW_MS);
    expect(got?.teamId).toBe("E123");
  });

  it("refuses a tampered payload (same signature)", () => {
    const token = signLinkToken({ teamId: "T123", slackUserId: "U456" }, SECRET, NOW_MS);
    const [payload, sig] = token.split(".");
    // Flip one byte in the base64url payload — the signature no longer matches.
    const tampered = Buffer.from("T999", "utf8").toString("base64url") + payload!.slice(4);
    expect(verifyLinkToken(`${tampered}.${sig}`, SECRET, NOW_MS)).toBeNull();
  });

  it("refuses a tampered signature (same payload)", () => {
    const token = signLinkToken({ teamId: "T123", slackUserId: "U456" }, SECRET, NOW_MS);
    const [payload, sig] = token.split(".");
    // Flip the last character of the signature.
    const flipped = sig!.slice(0, -1) + (sig!.endsWith("A") ? "B" : "A");
    expect(verifyLinkToken(`${payload}.${flipped}`, SECRET, NOW_MS)).toBeNull();
  });

  it("refuses an expired token", () => {
    const token = signLinkToken({ teamId: "T123", slackUserId: "U456" }, SECRET, NOW_MS);
    const later = NOW_MS + LINK_TOKEN_TTL_MS + 1;
    expect(verifyLinkToken(token, SECRET, later)).toBeNull();
  });

  it("accepts a token right at the expiry boundary", () => {
    const token = signLinkToken({ teamId: "T123", slackUserId: "U456" }, SECRET, NOW_MS);
    // At exactly the expiry millisecond, exp < nowMs is false → still valid.
    expect(verifyLinkToken(token, SECRET, NOW_MS + LINK_TOKEN_TTL_MS)).not.toBeNull();
  });

  it("refuses a token signed with a different secret", () => {
    const token = signLinkToken({ teamId: "T123", slackUserId: "U456" }, SECRET, NOW_MS);
    expect(verifyLinkToken(token, "wrong-secret", NOW_MS)).toBeNull();
  });

  it("refuses a payload whose teamId doesn't start with T or E", () => {
    // Hand-build a token whose payload names an invalid id; the signature is
    // computed against the tampered payload, so signature verifies — the shape
    // check is what catches it.
    const payload = Buffer.from(
      JSON.stringify({ t: "X123", u: "U456", n: null, e: FUTURE_MS }),
      "utf8",
    ).toString("base64url");
    const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
    expect(verifyLinkToken(`${payload}.${sig}`, SECRET, NOW_MS)).toBeNull();
  });

  it("refuses a payload whose slackUserId doesn't start with U or W", () => {
    const payload = Buffer.from(
      JSON.stringify({ t: "T123", u: "Z456", n: null, e: FUTURE_MS }),
      "utf8",
    ).toString("base64url");
    const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
    expect(verifyLinkToken(`${payload}.${sig}`, SECRET, NOW_MS)).toBeNull();
  });

  it("refuses a malformed token (no dot, empty parts)", () => {
    expect(verifyLinkToken("", SECRET, NOW_MS)).toBeNull();
    expect(verifyLinkToken("nodothere", SECRET, NOW_MS)).toBeNull();
    expect(verifyLinkToken(".sig-only", SECRET, NOW_MS)).toBeNull();
    expect(verifyLinkToken("payload-only.", SECRET, NOW_MS)).toBeNull();
  });

  it("refuses a payload that isn't valid JSON", () => {
    const payload = Buffer.from("not json at all", "utf8").toString("base64url");
    const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
    expect(verifyLinkToken(`${payload}.${sig}`, SECRET, NOW_MS)).toBeNull();
  });
});

describe("linkUrl", () => {
  it("builds a /slack/link URL with the token encoded (default path)", () => {
    expect(linkUrl("https://example.com", "abc/def+=")).toBe(
      "https://example.com/slack/link?t=abc%2Fdef%2B%3D",
    );
  });

  it("appends to the caller's chosen path when given", () => {
    expect(linkUrl("https://example.com", "tok", "/settings/slack/link")).toBe(
      "https://example.com/settings/slack/link?t=tok",
    );
  });

  it("strips trailing slashes on the host so /slack/link is unambiguous", () => {
    expect(linkUrl("https://example.com/", "tok")).toBe("https://example.com/slack/link?t=tok");
  });
});

describe("linkSlackUser", () => {
  it("upserts a link row on (team_id, slack_user_id)", async () => {
    const db = fakeSupabase({ slack_user_links: [] });
    await linkSlackUser(as(db), { teamId: "T1", slackUserId: "U1", userId: USER });
    expect(db.tables.slack_user_links).toEqual([
      { team_id: "T1", slack_user_id: "U1", user_id: USER },
    ]);

    // A second link from a different app user overwrites the first
    // (re-linking to a different account replaces the old one).
    await linkSlackUser(as(db), { teamId: "T1", slackUserId: "U1", userId: "user-2" });
    expect(db.tables.slack_user_links).toHaveLength(1);
    expect(db.tables.slack_user_links![0]!.user_id).toBe("user-2");
  });

  it("throws on a DB error", async () => {
    const service = {
      from: () => ({
        upsert: async () => ({ error: { message: "fk violation" } }),
      }),
    } as unknown as SupabaseClient;
    await expect(linkSlackUser(service, { teamId: "T1", slackUserId: "U1", userId: USER })).rejects.toThrow(
      /linkSlackUser:.*fk violation/,
    );
  });
});

describe("linkedUserId", () => {
  it("returns the user_id on a match", async () => {
    const db = fakeSupabase({ slack_user_links: [{ team_id: "T1", slack_user_id: "U1", user_id: USER }] });
    await expect(linkedUserId(as(db), "T1", "U1")).resolves.toBe(USER);
  });

  it("returns null on a miss", async () => {
    const db = fakeSupabase({ slack_user_links: [] });
    await expect(linkedUserId(as(db), "T1", "U-missing")).resolves.toBeNull();
  });
});

describe("linksForUser", () => {
  it("returns the user's links, newest first", async () => {
    const db = fakeSupabase({
      slack_user_links: [
        { team_id: "T-old", slack_user_id: "U-old", user_id: USER, created_at: "2025-01-01T00:00:00Z" },
        { team_id: "T-new", slack_user_id: "U-new", user_id: USER, created_at: "2026-09-01T00:00:00Z" },
        { team_id: "T-mid", slack_user_id: "U-mid", user_id: USER, created_at: "2026-03-01T00:00:00Z" },
      ],
    });

    await expect(linksForUser(as(db), USER)).resolves.toEqual([
      { teamId: "T-new", slackUserId: "U-new", createdAt: "2026-09-01T00:00:00Z" },
      { teamId: "T-mid", slackUserId: "U-mid", createdAt: "2026-03-01T00:00:00Z" },
      { teamId: "T-old", slackUserId: "U-old", createdAt: "2025-01-01T00:00:00Z" },
    ]);
  });

  it("returns an empty list when the user has no links", async () => {
    const db = fakeSupabase({ slack_user_links: [] });
    await expect(linksForUser(as(db), USER)).resolves.toEqual([]);
  });

  it("ignores other users' links", async () => {
    const db = fakeSupabase({
      slack_user_links: [
        { team_id: "T-other", slack_user_id: "U-other", user_id: "other-user", created_at: "2026-01-01T00:00:00Z" },
        { team_id: "T-mine", slack_user_id: "U-mine", user_id: USER, created_at: "2026-01-01T00:00:00Z" },
      ],
    });

    await expect(linksForUser(as(db), USER)).resolves.toEqual([
      { teamId: "T-mine", slackUserId: "U-mine", createdAt: "2026-01-01T00:00:00Z" },
    ]);
  });
});