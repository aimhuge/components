import { describe, it, expect } from "vitest";
import { isSafeOrgSlug, ORG_SLUG_PATTERN } from "../slug-pattern.js";

describe("isSafeOrgSlug", () => {
  it("accepts typical slugs", () => {
    expect(isSafeOrgSlug("acme")).toBe(true);
    expect(isSafeOrgSlug("acme-corp")).toBe(true);
    expect(isSafeOrgSlug("a.b.c")).toBe(true);
    expect(isSafeOrgSlug("Acme_2026")).toBe(true);
  });
  it("rejects slugs that begin with non-alnum", () => {
    expect(isSafeOrgSlug("-acme")).toBe(false);
    expect(isSafeOrgSlug(".acme")).toBe(false);
  });
  it("rejects slugs with protocol-relative or backslash tricks", () => {
    expect(isSafeOrgSlug("/evil.com")).toBe(false);
    expect(isSafeOrgSlug("//evil.com")).toBe(false);
    expect(isSafeOrgSlug("\\evil.com")).toBe(false);
  });
  it("rejects slugs longer than 100 chars", () => {
    expect(isSafeOrgSlug("a".repeat(101))).toBe(false);
    expect(isSafeOrgSlug("a".repeat(100))).toBe(true);
  });
});

describe("ORG_SLUG_PATTERN", () => {
  it("matches a single segment", () => {
    expect(new RegExp(`^${ORG_SLUG_PATTERN}$`).test("acme")).toBe(true);
  });
  it("does not match reserved path prefixes (api/, decks/)", () => {
    expect(new RegExp(`^${ORG_SLUG_PATTERN}$`).test("api")).toBe(true); // single segment matches
    expect(new RegExp(`^${ORG_SLUG_PATTERN}/`).test("api/decks/x")).toBe(false);
    expect(new RegExp(`^${ORG_SLUG_PATTERN}/`).test("decks/x")).toBe(false);
  });
});