import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = {
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
  getUser: vi.fn(),
};
vi.mock("../server/supabase-server.js", () => ({ getSupabaseServer: async () => ({ auth }) }));

import { createAuthCallback } from "../server/callback.js";
import { createAuthConfirm } from "../server/confirm.js";

const ORIGIN = "https://app.example";
const callback = (query: string, onSignedIn?: () => Promise<void>) =>
  createAuthCallback({ defaultNext: "/home", onSignedIn })(new Request(`${ORIGIN}/auth/callback?${query}`));
const location = (res: Response) => new URL(res.headers.get("location")!);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  auth.exchangeCodeForSession.mockResolvedValue({ error: null });
  auth.verifyOtp.mockResolvedValue({ error: null });
  auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
});

describe("createAuthCallback", () => {
  it("exchanges the code and goes on to next", async () => {
    const res = await callback("code=abc&next=%2Fdecks%2Fq3");
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(location(res).href).toBe(`${ORIGIN}/decks/q3`);
  });

  it("never redirects off-site, however next is spelled", async () => {
    for (const next of ["https://evil.com", "//evil.com", "/\\evil.com"]) {
      const res = await callback(`code=abc&next=${encodeURIComponent(next)}`);
      expect(location(res).href).toBe(`${ORIGIN}/home`);
    }
  });

  it("reports each failure with its own reason", async () => {
    expect(location(await callback("error=access_denied")).searchParams.get("reason")).toBe("provider");
    expect(location(await callback("")).searchParams.get("reason")).toBe("nocode");
    auth.exchangeCodeForSession.mockResolvedValue({ error: { message: "verifier missing" } });
    const res = await callback("code=abc");
    expect(location(res).pathname).toBe("/login");
    expect(location(res).searchParams.get("error")).toBe("link");
    expect(location(res).searchParams.get("reason")).toBe("exchange");
  });

  // A refused identity link must come back as a plain sign-in, or the form
  // would try to link again and loop.
  it("turns a refused link into signin=force, keeping next", async () => {
    for (const query of ["link=1&next=%2Fclaim%2Ft&error=server_error&error_code=identity_already_exists", "link=1&next=%2Fclaim%2Ft"]) {
      const dest = location(await callback(query));
      expect(dest.pathname).toBe("/login");
      expect(dest.searchParams.get("signin")).toBe("force");
      expect(dest.searchParams.get("next")).toBe("/claim/t");
    }
  });

  it("runs the app's hook with the signed-in user", async () => {
    const onSignedIn = vi.fn().mockResolvedValue(undefined);
    await callback("code=abc", onSignedIn);
    expect(onSignedIn).toHaveBeenCalledWith(expect.objectContaining({ user: { id: "u1" } }));
  });

  it("still redirects when the app's hook throws", async () => {
    const res = await callback("code=abc&next=%2Fdecks", async () => {
      throw new Error("record_login failed");
    });
    expect(location(res).href).toBe(`${ORIGIN}/decks`);
  });

  it("does not run the hook when the exchange fails", async () => {
    const onSignedIn = vi.fn();
    auth.exchangeCodeForSession.mockResolvedValue({ error: { message: "nope" } });
    await callback("code=abc", onSignedIn);
    expect(onSignedIn).not.toHaveBeenCalled();
  });
});

describe("createAuthConfirm", () => {
  const confirm = (query: string, loginPath?: string) =>
    createAuthConfirm({ defaultNext: "/home", loginPath })(new Request(`${ORIGIN}/auth/confirm?${query}`));

  it("verifies the token hash and goes on to next", async () => {
    const res = await confirm("token_hash=h&type=magiclink&next=%2Fdecks");
    expect(auth.verifyOtp).toHaveBeenCalledWith({ type: "magiclink", token_hash: "h" });
    expect(location(res).href).toBe(`${ORIGIN}/decks`);
  });

  it("sends a bad link back to the app's own sign-in page", async () => {
    expect(location(await confirm("type=magiclink", "/signin")).pathname).toBe("/signin");
    auth.verifyOtp.mockResolvedValue({ error: { message: "expired" } });
    const dest = location(await confirm("token_hash=h&type=magiclink"));
    expect(dest.searchParams.get("reason")).toBe("verify");
  });
});
