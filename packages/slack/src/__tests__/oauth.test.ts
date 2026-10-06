import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  buildInstallUrl,
  decodeOAuthState,
  encodeOAuthState,
  exchangeSlackCode,
  newOAuthNonce,
  nonceMatches,
  oauthCookieOptions,
  parseSlackInstall,
} from "../server/oauth.js";

/**
 * The OAuth half of Slack. What is pinned here is the wire shape Slack
 * documents, the connect flow's CSRF state, and the `oauth.v2.access` body
 * — `parseSlackInstall` reads the bot token and the webhook off it, and that
 * is the only piece of the consent screen we control.
 */

type FetchFn = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
let fetchMock: Mock<FetchFn>;

function stubFetch(handler: (url: string, init: RequestInit) => Response) {
  fetchMock = vi.fn<FetchFn>(async (input, init = {}) => handler(String(input), init));
  vi.stubGlobal("fetch", fetchMock);
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const lastUrl = () => String(fetchMock.mock.calls[fetchMock.mock.calls.length - 1]?.[0] ?? "");
const lastInit = () => fetchMock.mock.calls[fetchMock.mock.calls.length - 1]?.[1] ?? {};
const lastForm = () => new URLSearchParams(String(lastInit().body));

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("buildInstallUrl", () => {
  it("sends consent to slack.com with every bot scope, the redirect URI, and the state", () => {
    const url = new URL(
      buildInstallUrl({
        clientId: "C12345",
        scopes: ["chat:write", "incoming-webhook"],
        redirectUri: "https://example.com/api/slack/oauth/callback",
        state: "c3RhdGU",
      }),
    );

    expect(`${url.origin}${url.pathname}`).toBe("https://slack.com/oauth/v2/authorize");
    expect(url.searchParams.get("client_id")).toBe("C12345");
    expect(url.searchParams.get("state")).toBe("c3RhdGU");
    // Slack's docs and every example comma-separate the scope list.
    expect(url.searchParams.get("scope")).toBe("chat:write,incoming-webhook");
    expect(url.searchParams.get("redirect_uri")).toBe("https://example.com/api/slack/oauth/callback");
    // No user_scope → not in the URL.
    expect(url.searchParams.get("user_scope")).toBeNull();
  });

  it("includes user_scope only when given", () => {
    const url = new URL(
      buildInstallUrl({
        clientId: "C1",
        scopes: ["chat:write"],
        redirectUri: "https://example.com/cb",
        state: "s",
        userScopes: ["im:read", "im:history"],
      }),
    );
    expect(url.searchParams.get("user_scope")).toBe("im:read,im:history");
  });
});

describe("parseSlackInstall", () => {
  it("reads a realistic oauth.v2.access body, including the picker and webhook", () => {
    const body = {
      ok: true,
      access_token: "xoxb-fresh-install-token",
      scope: "chat:write,incoming-webhook",
      bot_user_id: "B999",
      team: { id: "T12345", name: "Acme" },
      enterprise: { id: "E98765", name: "Acme Corp" },
      authed_user: { id: "U777" },
      incoming_webhook: {
        channel_id: "C123",
        channel: "#news",
        url: "https://hooks.slack.com/services/T12345/B999/abc",
        configuration_url: "https://acme.slack.com/services/B999",
      },
    };
    expect(parseSlackInstall(body)).toEqual({
      teamId: "T12345",
      teamName: "Acme",
      enterpriseId: "E98765",
      botUserId: "B999",
      botToken: "xoxb-fresh-install-token",
      scopes: "chat:write,incoming-webhook",
      installerSlackUserId: "U777",
      channelId: "C123",
      channelName: "#news",
      webhookUrl: "https://hooks.slack.com/services/T12345/B999/abc",
      configurationUrl: "https://acme.slack.com/services/B999",
    });
  });

  it("returns null channels and null webhook fields when the installer skipped the picker", () => {
    const body = {
      ok: true,
      access_token: "xoxb-no-webhook",
      scope: "chat:write",
      bot_user_id: "B1",
      team: { id: "T1", name: "Acme" },
      authed_user: { id: "U1" },
      // incoming_webhook absent.
    };
    expect(parseSlackInstall(body)).toEqual({
      teamId: "T1",
      teamName: "Acme",
      enterpriseId: null,
      botUserId: "B1",
      botToken: "xoxb-no-webhook",
      scopes: "chat:write",
      installerSlackUserId: "U1",
      channelId: null,
      channelName: null,
      webhookUrl: null,
      configurationUrl: null,
    });
  });

  it("throws slack_install_incomplete when the bot token is missing or wrong-prefixed", () => {
    const missing = {
      ok: true,
      scope: "chat:write",
      bot_user_id: "B1",
      team: { id: "T1", name: "Acme" },
    };
    expect(() => parseSlackInstall(missing)).toThrow("slack_install_incomplete");

    // A user token (`xoxp-…`) is not a bot token and must not be stored.
    const user = {
      ok: true,
      access_token: "xoxp-not-a-bot-token",
      scope: "chat:write",
      bot_user_id: "B1",
      team: { id: "T1", name: "Acme" },
    };
    expect(() => parseSlackInstall(user)).toThrow("slack_install_incomplete");
  });

  it("throws slack_install_incomplete when the team id or bot user id is missing", () => {
    const noTeam = {
      ok: true,
      access_token: "xoxb-tok",
      scope: "chat:write",
      bot_user_id: "B1",
      team: { name: "Acme" },
    };
    expect(() => parseSlackInstall(noTeam)).toThrow("slack_install_incomplete");

    const noBot = {
      ok: true,
      access_token: "xoxb-tok",
      scope: "chat:write",
      team: { id: "T1", name: "Acme" },
    };
    expect(() => parseSlackInstall(noBot)).toThrow("slack_install_incomplete");
  });

  it("never puts the token in the error message", () => {
    try {
      parseSlackInstall({ ok: true, team: { id: "T1" } });
    } catch (err) {
      expect(String(err)).not.toContain("xoxb");
    }
  });
});

describe("exchangeSlackCode", () => {
  it("posts the app pair and the redirect URI to slack.com/api/oauth.v2.access, form-encoded", async () => {
    stubFetch(() =>
      json(200, {
        ok: true,
        access_token: "xoxb-from-exchange",
        scope: "chat:write",
        bot_user_id: "B9",
        team: { id: "T9", name: "Acme" },
        authed_user: { id: "U9" },
        incoming_webhook: {
          channel_id: "C9",
          channel: "#general",
          url: "https://hooks.slack.com/x",
          configuration_url: "https://acme.slack.com/services/B9",
        },
      }),
    );

    const install = await exchangeSlackCode({
      code: "the-code",
      clientId: "C12345",
      clientSecret: "the-secret",
      redirectUri: "https://example.com/api/slack/oauth/callback",
    });

    expect(lastUrl()).toBe("https://slack.com/api/oauth.v2.access");
    expect(lastInit().method).toBe("POST");
    expect(lastInit().headers).toMatchObject({ "content-type": "application/x-www-form-urlencoded" });
    expect(Object.fromEntries(lastForm())).toEqual({
      client_id: "C12345",
      client_secret: "the-secret",
      code: "the-code",
      redirect_uri: "https://example.com/api/slack/oauth/callback",
    });
    expect(install.botToken).toBe("xoxb-from-exchange");
    expect(install.channelId).toBe("C9");
    expect(install.channelName).toBe("#general");
    expect(install.webhookUrl).toBe("https://hooks.slack.com/x");
    expect(install.configurationUrl).toBe("https://acme.slack.com/services/B9");
  });

  it("rejects with Slack's error code and keeps the secret and code out of the message", async () => {
    stubFetch(() => json(200, { ok: false, error: "invalid_code" }));

    const thrown = await exchangeSlackCode({
      code: "the-code",
      clientId: "C12345",
      clientSecret: "the-secret",
      redirectUri: "https://example.com/cb",
    }).catch((e: unknown) => e);

    expect(String(thrown)).toContain("invalid_code");
    expect(String(thrown)).not.toContain("the-code");
    expect(String(thrown)).not.toContain("the-secret");
  });

  it("rejects when Slack's answer never arrived", async () => {
    stubFetch(() => {
      throw new TypeError("fetch failed");
    });

    const thrown = await exchangeSlackCode({
      code: "the-code",
      clientId: "C12345",
      clientSecret: "the-secret",
      redirectUri: "https://example.com/cb",
    }).catch((e: unknown) => e);
    expect(String(thrown)).toMatch(/unreached|fetch failed/);
  });
});
