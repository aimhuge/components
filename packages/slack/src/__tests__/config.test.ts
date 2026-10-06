import { describe, expect, it } from "vitest";
import { liveWebhookUrl, slackAppConfig, slackConfigured } from "../server/config.js";

const HOOK = "https://hooks.slack.com/services/T000/B000/XXXX";

describe("slackAppConfig", () => {
  it("returns the trimmed config when all three are set", () => {
    expect(
      slackAppConfig({
        SLACK_CLIENT_ID: " id ",
        SLACK_CLIENT_SECRET: "  secret ",
        SLACK_SIGNING_SECRET: "  sig  ",
      }),
    ).toEqual({ clientId: "id", clientSecret: "secret", signingSecret: "sig" });
  });

  it("returns null when any of the three is missing or whitespace", () => {
    expect(slackAppConfig({ SLACK_CLIENT_ID: "a", SLACK_CLIENT_SECRET: "b", SLACK_SIGNING_SECRET: " " })).toBeNull();
    expect(slackAppConfig({ SLACK_CLIENT_ID: "a", SLACK_CLIENT_SECRET: "b" })).toBeNull();
    expect(slackAppConfig({})).toBeNull();
  });
});

describe("slackConfigured", () => {
  it("is true iff all three are set", () => {
    expect(slackConfigured({ SLACK_CLIENT_ID: "a", SLACK_CLIENT_SECRET: "b", SLACK_SIGNING_SECRET: "s" })).toBe(true);
    expect(slackConfigured({ SLACK_CLIENT_ID: "a", SLACK_CLIENT_SECRET: "b" })).toBe(false);
    expect(slackConfigured({})).toBe(false);
  });
});

describe("liveWebhookUrl — the URL is not the guard", () => {
  it("returns the URL on the production deployment", () => {
    expect(liveWebhookUrl({ name: "SLACK_HOOK" }, { SLACK_HOOK: HOOK, VERCEL_ENV: "production", NODE_ENV: "production" })).toBe(HOOK);
  });

  it("stays quiet on a preview, which is also a production build", () => {
    expect(liveWebhookUrl({ name: "SLACK_HOOK" }, { SLACK_HOOK: HOOK, VERCEL_ENV: "preview", NODE_ENV: "production" })).toBeNull();
  });

  it("stays quiet locally even with the real URL in .env.local", () => {
    expect(liveWebhookUrl({ name: "SLACK_HOOK" }, { SLACK_HOOK: HOOK, NODE_ENV: "development" })).toBeNull();
  });

  it("sends locally only when the caller-named dev flag is set", () => {
    expect(liveWebhookUrl({ name: "SLACK_HOOK", devFlag: "SLACK_HOOK_DEV" }, { SLACK_HOOK: HOOK, NODE_ENV: "development", SLACK_HOOK_DEV: "1" })).toBe(HOOK);
    // The dev flag is 0 / not 1: still quiet.
    expect(liveWebhookUrl({ name: "SLACK_HOOK", devFlag: "SLACK_HOOK_DEV" }, { SLACK_HOOK: HOOK, NODE_ENV: "development", SLACK_HOOK_DEV: "0" })).toBeNull();
  });

  it("the dev flag bypasses any environment (local + preview alike) once set", () => {
    // The point of the dev flag is "I know what I'm doing, let it through" —
    // a preview is still a real build, but the dev flag says opt in.
    expect(
      liveWebhookUrl({ name: "SLACK_HOOK", devFlag: "SLACK_HOOK_DEV" }, { SLACK_HOOK: HOOK, VERCEL_ENV: "preview", NODE_ENV: "production", SLACK_HOOK_DEV: "1" }),
    ).toBe(HOOK);
  });

  it("refuses anything that isn't a Slack incoming-webhook URL", () => {
    expect(
      liveWebhookUrl({ name: "SLACK_HOOK" }, { SLACK_HOOK: "https://evil.example/hook", VERCEL_ENV: "production", NODE_ENV: "production" }),
    ).toBeNull();
  });

  it("refuses a missing or whitespace URL even with the right env", () => {
    expect(liveWebhookUrl({ name: "SLACK_HOOK" }, { SLACK_HOOK: "  ", VERCEL_ENV: "production", NODE_ENV: "production" })).toBeNull();
    expect(liveWebhookUrl({ name: "SLACK_HOOK" }, { VERCEL_ENV: "production", NODE_ENV: "production" })).toBeNull();
  });

  it("trims surrounding whitespace around the URL", () => {
    expect(
      liveWebhookUrl({ name: "SLACK_HOOK" }, { SLACK_HOOK: `  ${HOOK}  `, VERCEL_ENV: "production", NODE_ENV: "production" }),
    ).toBe(HOOK);
  });
});