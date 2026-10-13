import { describe, it, expect } from "vitest";
import { isReservedSlug, slugify, RESERVED_SLUGS } from "../slugs.js";

describe("isReservedSlug", () => {
  it("rejects reserved words regardless of case", () => {
    expect(isReservedSlug("settings")).toBe(true);
    expect(isReservedSlug("SETTINGS")).toBe(true);
  });
  it("rejects slugs shorter than 2 chars", () => {
    expect(isReservedSlug("a")).toBe(true);
    expect(isReservedSlug("")).toBe(true);
  });
  it("accepts a non-reserved slug of valid length", () => {
    expect(isReservedSlug("acme")).toBe(false);
    expect(isReservedSlug("acme-corp")).toBe(false);
  });
});

describe("slugify", () => {
  it("lowercases and replaces non-alphanumerics with -", () => {
    expect(slugify("Acme Corp! 2026")).toBe("acme-corp-2026");
  });
  it("trims leading and trailing dashes", () => {
    expect(slugify("---hello---")).toBe("hello");
  });
  it("falls back to 'workspace' for empty input", () => {
    expect(slugify("")).toBe("workspace");
    expect(slugify("!!!")).toBe("workspace");
  });
  it("truncates very long names to 40 chars", () => {
    const out = slugify("a".repeat(80));
    expect(out.length).toBeLessThanOrEqual(40);
  });
});

describe("RESERVED_SLUGS", () => {
  it("contains the standard set", () => {
    for (const s of ["api", "auth", "login", "settings", "team", "workspaces"]) {
      expect(RESERVED_SLUGS.has(s)).toBe(true);
    }
  });
});