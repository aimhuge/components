import { describe, it, expect } from "vitest";
import { normalizeEmail, isPlausibleEmail, escapeLikeWildcards } from "../email.js";

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Foo@BAR.com  ")).toBe("foo@bar.com");
  });
  it("does not strip dots or +tags", () => {
    expect(normalizeEmail("first.last+x@gmail.com")).toBe("first.last+x@gmail.com");
  });
});

describe("isPlausibleEmail", () => {
  it("accepts a normal address", () => {
    expect(isPlausibleEmail("a@b.co")).toBe(true);
  });
  it("rejects an empty value, no @, leading or trailing @, or whitespace", () => {
    expect(isPlausibleEmail("")).toBe(false);
    expect(isPlausibleEmail("a-b")).toBe(false);
    expect(isPlausibleEmail("@b.co")).toBe(false);
    expect(isPlausibleEmail("a@")).toBe(false);
    expect(isPlausibleEmail("a @b.co")).toBe(false);
  });
});

describe("escapeLikeWildcards", () => {
  it("escapes _, %, and backslash", () => {
    expect(escapeLikeWildcards("foo_bar%baz\\qux")).toBe("foo\\_bar\\%baz\\\\qux");
  });
  it("leaves a normal string alone", () => {
    expect(escapeLikeWildcards("alice@example.com")).toBe("alice@example.com");
  });
});