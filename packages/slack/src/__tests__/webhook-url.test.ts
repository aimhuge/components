import { describe, expect, it } from "vitest";
import { isSlackWebhookUrl, maskWebhookUrl } from "../webhook-url.js";

describe("isSlackWebhookUrl", () => {
  it("accepts a real Slack webhook URL", () => {
    expect(isSlackWebhookUrl("https://hooks.slack.com/services/T0/B0/abcdef1234")).toBe(true);
  });

  it("rejects anything missing https://hooks.slack.com/services/", () => {
    expect(isSlackWebhookUrl("http://hooks.slack.com/services/T0/B0/abc")).toBe(false);
    expect(isSlackWebhookUrl("https://example.com/services/T0/B0/abc")).toBe(false);
    expect(isSlackWebhookUrl("https://hooks.slack.com/other/T0/B0/abc")).toBe(false);
    expect(isSlackWebhookUrl("")).toBe(false);
  });
});

describe("maskWebhookUrl", () => {
  it("shows hooks.slack.com/…/ plus the last four characters", () => {
    expect(maskWebhookUrl("https://hooks.slack.com/services/T0/B0/abcdef1234")).toBe("hooks.slack.com/…/1234");
  });

  it("returns the empty string for anything that isn't one (no leak)", () => {
    // A typo / attacker-supplied URL must not be partially displayed — it
    // would still leak "the URL we tried" to the user.
    expect(maskWebhookUrl("https://example.com/hook")).toBe("");
    expect(maskWebhookUrl("")).toBe("");
    expect(maskWebhookUrl("not-a-url")).toBe("");
  });
});