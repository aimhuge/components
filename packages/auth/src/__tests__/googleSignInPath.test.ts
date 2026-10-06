// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { DesktopAuth } from "../desktop.js";

const auth = {
  getUser: vi.fn(),
  linkIdentity: vi.fn(),
  signInWithOAuth: vi.fn(),
  signInWithOtp: vi.fn(),
  onAuthStateChange: vi.fn(),
};
vi.mock("../client/supabase-browser.js", () => ({ getSupabaseBrowser: () => ({ auth }) }));
const navigateTo = vi.fn();
vi.mock("../client/navigate.js", () => ({ navigateTo: (url: string) => navigateTo(url) }));

let searchParams = new URLSearchParams();
vi.mock("next/navigation.js", () => ({ useSearchParams: () => searchParams }));

import { useLoginFlow } from "../client/useLoginFlow.js";
import { useAuth } from "../client/useAuth.js";

/**
 * `googleSignInPath`: the Google button goes to the app's own route instead of
 * Supabase's hosted flow, on the web only. A guest upgrade and a desktop shell
 * still take the hosted flow, which is the only one that can do them.
 */
const PATH = "/auth/google";

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams();
  auth.getUser.mockResolvedValue({ data: { user: null } });
  auth.signInWithOAuth.mockResolvedValue({ data: { url: "https://accounts.google.com/x" }, error: null });
  auth.linkIdentity.mockResolvedValue({ data: { url: "https://accounts.google.com/x" }, error: null });
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: () => {} } } });
});

describe("useLoginFlow with googleSignInPath", () => {
  it("leaves for the app's own route with next, and stays busy", async () => {
    searchParams = new URLSearchParams({ next: "/decks/q3" });
    const { result } = renderHook(() => useLoginFlow({ defaultNext: "/home", googleSignInPath: PATH }));
    await act(() => result.current.signInWithGoogle());
    expect(navigateTo).toHaveBeenCalledWith("/auth/google?next=%2Fdecks%2Fq3");
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
    expect(result.current.busy).toBe("google");
  });

  it("falls back to defaultNext", async () => {
    const { result } = renderHook(() => useLoginFlow({ defaultNext: "/home", googleSignInPath: PATH }));
    await act(() => result.current.signInWithGoogle());
    expect(navigateTo).toHaveBeenCalledWith("/auth/google?next=%2Fhome");
  });

  it("still links a guest through the hosted flow", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "anon-1", is_anonymous: true } } });
    const { result } = renderHook(() =>
      useLoginFlow({ defaultNext: "/home", googleSignInPath: PATH, linkAnonymous: true }),
    );
    await act(() => result.current.signInWithGoogle());
    expect(auth.linkIdentity).toHaveBeenCalled();
    expect(navigateTo).not.toHaveBeenCalled();
  });

  it("still opens the hosted flow in the system browser inside a desktop shell", async () => {
    const desktop: DesktopAuth = {
      isDesktop: () => true,
      redirectTo: (next) => `/desktop/return?next=${encodeURIComponent(next)}`,
      defaultNext: "/desktop/home",
      signedOutPath: "/desktop/welcome",
      openExternal: vi.fn().mockResolvedValue(undefined),
    };
    const { result } = renderHook(() => useLoginFlow({ defaultNext: "/home", googleSignInPath: PATH, desktop }));
    await act(() => result.current.signInWithGoogle());
    expect(desktop.openExternal).toHaveBeenCalledWith("https://accounts.google.com/x");
    expect(navigateTo).not.toHaveBeenCalled();
  });
});

describe("useAuth with googleSignInPath", () => {
  it("leaves for the app's own route, with next only when there is one", async () => {
    const { result } = renderHook(() => useAuth({ googleSignInPath: PATH }));
    await act(async () => {
      expect(await result.current.signInWithGoogle("/oauth/consent?x=1")).toEqual({ error: null });
    });
    expect(navigateTo).toHaveBeenCalledWith("/auth/google?next=%2Foauth%2Fconsent%3Fx%3D1");

    await act(async () => void (await result.current.signInWithGoogle()));
    expect(navigateTo).toHaveBeenLastCalledWith("/auth/google");
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
  });
});
