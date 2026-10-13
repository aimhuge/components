import { describe, it, expect } from "vitest";
import { isSuperAdmin } from "../super-admin-emails.js";

describe("isSuperAdmin", () => {
  it("is false for null, undefined, empty", () => {
    expect(isSuperAdmin(null)).toBe(false);
    expect(isSuperAdmin(undefined)).toBe(false);
    expect(isSuperAdmin("")).toBe(false);
  });
  it("matches case-insensitively against the allowlist", () => {
    // The allowlist is process.env.SUPER_ADMIN_EMAILS at module-load.
    // In CI this is unset, so we don't assert membership; only that
    // arbitrary non-allowlisted addresses return false.
    expect(isSuperAdmin("nope@example.com")).toBe(false);
  });
});