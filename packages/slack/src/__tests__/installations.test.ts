/**
 * Tests for `slack_installations` row reads and writes. Pure DB: the fake
 * supabase stands in for the table; assertions are on the rows left behind
 * (the only way to catch a `from("slack_installations")` typo that landed
 * an `update` on a different table).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "./fake-supabase";
import {
  getInstallation,
  parseTeamChannelId,
  revokeInstallation,
  saveInstallation,
  teamChannelId,
} from "../server/installations.js";
import type { SlackInstall } from "../server/oauth.js";

const as = (db: FakeSupabase) => db as unknown as SupabaseClient;

function install(over: Partial<SlackInstall> = {}): SlackInstall {
  return {
    teamId: "T1",
    teamName: "Acme",
    enterpriseId: "E1",
    botUserId: "B1",
    botToken: "xoxb-1",
    scopes: "chat:write",
    installerSlackUserId: "U9",
    channelId: "C1",
    channelName: "#general",
    webhookUrl: "https://hooks.slack.com/services/T1/B1/x",
    configurationUrl: "https://acme.slack.com/services/B1",
    ...over,
  };
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("teamChannelId / parseTeamChannelId", () => {
  it("round-trips a team + channel pair", () => {
    expect(teamChannelId("T1", "C1")).toBe("T1:C1");
    expect(parseTeamChannelId(teamChannelId("T1", "C1"))).toEqual({ teamId: "T1", channelId: "C1" });
  });

  it("accepts the Slack prefixes (T/E for team, C/G/D for channel)", () => {
    expect(parseTeamChannelId("E1:G1")).toEqual({ teamId: "E1", channelId: "G1" });
    expect(parseTeamChannelId("T1:D1")).toEqual({ teamId: "T1", channelId: "D1" });
  });

  it("rejects anything that isn't exactly one `:` of two non-empty, well-prefixed halves", () => {
    expect(parseTeamChannelId("C456")).toBeNull();
    expect(parseTeamChannelId("T1:")).toBeNull();
    expect(parseTeamChannelId(":C1")).toBeNull();
    expect(parseTeamChannelId("T1:C2:C3")).toBeNull();
    expect(parseTeamChannelId("")).toBeNull();
    expect(parseTeamChannelId(null)).toBeNull();
    expect(parseTeamChannelId(undefined)).toBeNull();
    // Lowercase ids aren't real Slack tokens.
    expect(parseTeamChannelId("t1:c1")).toBeNull();
    // Channels on Slack that start with `T` (e.g. shared channels on a
    // different shape) — not a valid channel prefix.
    expect(parseTeamChannelId("T1:T2")).toBeNull();
  });
});

describe("saveInstallation", () => {
  it("upserts a fresh install with status 'active' and the install fields", async () => {
    const db = fakeSupabase({ slack_installations: [] });
    const before = Date.now();

    await saveInstallation(as(db), install(), "user-1");

    const rows = db.tables.slack_installations;
    expect(rows).toHaveLength(1);
    const row = rows![0]!;
    expect(row.team_id).toBe("T1");
    expect(row.team_name).toBe("Acme");
    expect(row.enterprise_id).toBe("E1");
    expect(row.bot_user_id).toBe("B1");
    expect(row.bot_token).toBe("xoxb-1");
    expect(row.scopes).toBe("chat:write");
    expect(row.installed_by).toBe("user-1");
    expect(row.status).toBe("active");
    // updated_at is set to a real timestamp near "now" (string ISO).
    expect(typeof row.updated_at).toBe("string");
    expect(new Date(row.updated_at as string).getTime()).toBeGreaterThanOrEqual(before);
  });

  it("upserts in place on reinstall (same team_id, onConflict: team_id)", async () => {
    const db = fakeSupabase({
      slack_installations: [
        {
          team_id: "T1",
          team_name: "Old Name",
          bot_user_id: "B-old",
          bot_token: "xoxb-old",
          status: "revoked",
          updated_at: "2020-01-01T00:00:00.000Z",
        },
      ],
    });

    await saveInstallation(as(db), install({ teamName: "New Name", botUserId: "B-new", botToken: "xoxb-new" }), null);

    const rows = db.tables.slack_installations;
    expect(rows).toHaveLength(1);
    const row = rows![0]!;
    expect(row.team_id).toBe("T1");
    expect(row.team_name).toBe("New Name");
    expect(row.bot_user_id).toBe("B-new");
    expect(row.bot_token).toBe("xoxb-new");
    expect(row.status).toBe("active");
  });

  it("touches only slack_installations — does not read or write the app's channels table", async () => {
    const db = fakeSupabase({
      slack_installations: [],
      // Pre-seed a `channels` row that must NOT be touched.
      channels: [
        { id: "chan-1", platform: "slack", external_id: "T1:C1", status: "revoked", access_token: "xoxb-old" },
      ],
    });

    await saveInstallation(as(db), install(), "user-1");

    const chan = db.tables.channels![0]!;
    expect(chan.access_token).toBe("xoxb-old");
    expect(chan.status).toBe("revoked");
  });

  it("throws with the DB error message on failure", async () => {
    // A service whose only `slack_installations` call returns an error.
    const service = {
      from: (table: string) => {
        if (table !== "slack_installations") throw new Error(`unexpected table ${table}`);
        return {
          upsert: async () => ({ error: { message: "duplicate key value violates unique constraint" } }),
        };
      },
    } as unknown as SupabaseClient;

    await expect(saveInstallation(service, install(), null)).rejects.toThrow(
      /saveInstallation:.*duplicate key value/,
    );
  });
});

describe("getInstallation", () => {
  it("returns the install fields for an active install", async () => {
    const db = fakeSupabase({
      slack_installations: [
        {
          team_id: "T1",
          team_name: "Acme",
          bot_user_id: "B1",
          bot_token: "xoxb-1",
          status: "active",
        },
      ],
    });

    await expect(getInstallation(as(db), "T1")).resolves.toEqual({
      teamId: "T1",
      teamName: "Acme",
      botUserId: "B1",
      botToken: "xoxb-1",
      status: "active",
    });
  });

  it("returns null when the install is missing", async () => {
    const db = fakeSupabase({ slack_installations: [] });
    await expect(getInstallation(as(db), "T-missing")).resolves.toBeNull();
  });

  it("returns null when the install is revoked", async () => {
    const db = fakeSupabase({
      slack_installations: [
        {
          team_id: "T1",
          team_name: "Acme",
          bot_user_id: "B1",
          bot_token: "xoxb-1",
          status: "revoked",
        },
      ],
    });
    await expect(getInstallation(as(db), "T1")).resolves.toBeNull();
  });

  it("throws on a DB error", async () => {
    const service = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: { message: "connection reset" } }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;
    await expect(getInstallation(service, "T1")).rejects.toThrow(/getInstallation:.*connection reset/);
  });
});

describe("revokeInstallation", () => {
  it("marks the install revoked and returns true", async () => {
    const db = fakeSupabase({
      slack_installations: [
        { team_id: "T1", bot_user_id: "B1", bot_token: "xoxb-1", status: "active" },
      ],
    });

    const result = await revokeInstallation(as(db), "T1");
    expect(result).toBe(true);
    expect(db.tables.slack_installations![0]!.status).toBe("revoked");
  });

  it("does not touch the app's channels table", async () => {
    const db = fakeSupabase({
      slack_installations: [
        { team_id: "T1", bot_user_id: "B1", bot_token: "xoxb-1", status: "active" },
      ],
      channels: [
        { id: "chan-1", platform: "slack", external_id: "T1:C1", status: "active", access_token: "xoxb-1" },
      ],
    });

    await revokeInstallation(as(db), "T1");

    const chan = db.tables.channels![0]!;
    expect(chan.status).toBe("active");
    expect(chan.access_token).toBe("xoxb-1");
  });

  it("returns false and never throws on a DB error", async () => {
    const service = {
      from: () => ({
        update: () => ({
          eq: async () => ({ error: { message: "deadlock detected" } }),
        }),
      }),
    } as unknown as SupabaseClient;

    // The promise resolves to false (no throw).
    const result = await revokeInstallation(service, "T1");
    expect(result).toBe(false);
  });
});
