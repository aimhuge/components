/**
 * `@aimhuge/teams`'s `isSuperAdmin` reads `SUPER_ADMIN_EMAILS` once at module
 * load time. Our tests want to set the env per-case, so we use
 * `vi.resetModules()` and a dynamic `await import(...)` to pick up the new
 * env on every test.
 *
 * `notFound()` from `next/navigation` throws an `Error` with the digest
 * `NEXT_HTTP_ERROR_FALLBACK;404`. We just check that some error is thrown.
 *
 * The dynamic import is slow on a cold cache; the default 5s timeout trips
 * the first test under `--frozen-lockfile`. 20s is plenty.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

// Extend the default 5s test timeout for this file — see the note above.
vi.setConfig({ testTimeout: 20_000 });

const ORIGINAL_ENV = process.env.SUPER_ADMIN_EMAILS;

async function loadGuard(env: string | undefined) {
  if (env === undefined) {
    delete process.env.SUPER_ADMIN_EMAILS;
  } else {
    process.env.SUPER_ADMIN_EMAILS = env;
  }
  vi.resetModules();
  const mod = await import("../server/requireSuperAdmin.js");
  return mod;
}

afterEach(() => {
  if (ORIGINAL_ENV === undefined) {
    delete process.env.SUPER_ADMIN_EMAILS;
  } else {
    process.env.SUPER_ADMIN_EMAILS = ORIGINAL_ENV;
  }
  vi.resetModules();
});

describe("requireSuperAdmin", () => {
  it("returns the email when the caller is on the allowlist", async () => {
    const { requireSuperAdmin } = await loadGuard("founder@example.com,cto@example.com");
    expect(requireSuperAdmin({ email: "founder@example.com" })).toBe(
      "founder@example.com",
    );
  });

  it("is case-insensitive on both sides", async () => {
    const { requireSuperAdmin } = await loadGuard("founder@example.com,cto@example.com");
    expect(requireSuperAdmin({ email: "cto@EXAMPLE.com" })).toBe(
      "cto@EXAMPLE.com",
    );
  });

  it("throws when the caller is not on the allowlist", async () => {
    const { requireSuperAdmin } = await loadGuard("founder@example.com");
    expect(() => requireSuperAdmin({ email: "rando@example.com" })).toThrow();
  });

  it("throws when the caller has no email", async () => {
    const { requireSuperAdmin } = await loadGuard("founder@example.com");
    expect(() => requireSuperAdmin({ email: null })).toThrow();
    expect(() => requireSuperAdmin({ email: undefined })).toThrow();
  });

  it("returns false for everyone when the env var is unset", async () => {
    const { isAdminCaller } = await loadGuard(undefined);
    expect(isAdminCaller({ email: "founder@example.com" })).toBe(false);
  });
});

describe("isAdminCaller", () => {
  it("returns true for an admin", async () => {
    const { isAdminCaller } = await loadGuard("founder@example.com");
    expect(isAdminCaller({ email: "founder@example.com" })).toBe(true);
  });

  it("returns false for a non-admin", async () => {
    const { isAdminCaller } = await loadGuard("founder@example.com");
    expect(isAdminCaller({ email: "rando@example.com" })).toBe(false);
  });

  it("returns false for null/undefined without throwing", async () => {
    const { isAdminCaller } = await loadGuard("founder@example.com");
    expect(isAdminCaller({ email: null })).toBe(false);
    expect(isAdminCaller({ email: undefined })).toBe(false);
  });
});
