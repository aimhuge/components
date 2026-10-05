// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const auth = {
  getUser: vi.fn(),
  linkIdentity: vi.fn(),
  signInWithOAuth: vi.fn(),
  signInWithOtp: vi.fn(),
};
vi.mock("../client/supabase-browser.js", () => ({ getSupabaseBrowser: () => ({ auth }) }));

let searchParams = new URLSearchParams();
vi.mock("next/navigation.js", () => ({ useSearchParams: () => searchParams }));

import { useLoginFlow } from "../client/useLoginFlow.js";

/**
 * The hook on its own, the way an app drawing its own form uses it. The
 * behaviour matrix (guest upgrade, desktop shell, signin=force) is covered
 * through the default form in LoginForm.test.tsx; this pins the state an app
 * renders from.
 */
beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams();
  auth.signInWithOAuth.mockResolvedValue({ error: null });
  auth.signInWithOtp.mockResolvedValue({ error: null });
});

const flow = () => renderHook(() => useLoginFlow({ defaultNext: "/home" }));

describe("useLoginFlow", () => {
  it("starts idle", () => {
    const { result } = flow();
    expect(result.current).toMatchObject({ busy: null, error: null, sentTo: null, awaitingBrowser: false });
  });

  it("stays busy while the page leaves for Google", async () => {
    const { result } = flow();
    await act(() => result.current.signInWithGoogle());
    expect(result.current.busy).toBe("google");
    expect(result.current.error).toBeNull();
  });

  it("reports a refused handoff and goes idle again", async () => {
    auth.signInWithOAuth.mockResolvedValue({ error: { message: "Provider is not enabled" } });
    const { result } = flow();
    await act(() => result.current.signInWithGoogle());
    expect(result.current).toMatchObject({ busy: null, error: "Provider is not enabled" });
  });

  it("records where the magic link went, and reset returns to the form", async () => {
    const { result } = flow();
    await act(() => result.current.sendMagicLink("a@b.co"));
    expect(result.current).toMatchObject({ busy: null, sentTo: "a@b.co" });

    act(() => result.current.reset());
    expect(result.current).toMatchObject({ busy: null, error: null, sentTo: null, awaitingBrowser: false });
  });

  it("ignores an empty address", async () => {
    const { result } = flow();
    await act(() => result.current.sendMagicLink(""));
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("opens on the callback's expired-link error", () => {
    searchParams = new URLSearchParams({ error: "link" });
    const { result } = flow();
    expect(result.current.error).toMatch(/expired or was already used/);
  });
});
