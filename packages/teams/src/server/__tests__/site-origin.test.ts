import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { siteOrigin } from "../site-origin.js";

describe("siteOrigin", () => {
  const ORIG = process.env.NEXT_PUBLIC_SITE_URL;
  afterEach(() => {
    if (ORIG === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = ORIG;
  });

  it("returns the env var with trailing slash stripped", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.com/";
    expect(siteOrigin()).toBe("https://example.com");
  });

  it("falls back to the provided value when env is missing", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(siteOrigin("https://fallback.test")).toBe("https://fallback.test");
  });
});