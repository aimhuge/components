// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DesktopAuth } from "../desktop.js";

const auth = {
  getUser: vi.fn(),
  linkIdentity: vi.fn(),
  signInWithOAuth: vi.fn(),
  signInWithOtp: vi.fn(),
};
vi.mock("../client/supabase-browser.js", () => ({ getSupabaseBrowser: () => ({ auth }) }));

let searchParams = new URLSearchParams();
vi.mock("next/navigation.js", () => ({ useSearchParams: () => searchParams }));

import { LoginForm } from "../client/LoginForm.js";

/** The first argument of a mock's first call: the `{ provider, options }` / `{ email, options }` bag. */
const firstArg = (fn: { mock: { calls: unknown[][] } }) =>
  fn.mock.calls[0]?.[0] as { options: { redirectTo?: string; emailRedirectTo?: string; skipBrowserRedirect?: boolean } };

const asGuest = () => auth.getUser.mockResolvedValue({ data: { user: { id: "anon-1", is_anonymous: true } } });
const asVisitor = () => auth.getUser.mockResolvedValue({ data: { user: null } });

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams();
  auth.linkIdentity.mockResolvedValue({ error: null });
  auth.signInWithOAuth.mockResolvedValue({ error: null });
  auth.signInWithOtp.mockResolvedValue({ error: null });
});

afterEach(cleanup);

describe("LoginForm — web", () => {
  it("sends Google back to this origin's callback with next", async () => {
    asVisitor();
    searchParams = new URLSearchParams({ next: "/decks/q3" });

    render(<LoginForm defaultNext="/home" />);
    fireEvent.click(screen.getByText("Continue with Google"));

    await waitFor(() => expect(auth.signInWithOAuth).toHaveBeenCalled());
    expect(firstArg(auth.signInWithOAuth).options).toEqual({
      redirectTo: `${window.location.origin}/auth/callback?next=%2Fdecks%2Fq3`,
    });
    // The page is leaving for Google: the button stays busy rather than
    // flicking back to idle mid-redirect.
    expect(screen.getByText(/Redirecting to Google/)).toBeTruthy();
  });

  it("uses the app's default when there is no ?next=", async () => {
    render(<LoginForm defaultNext="/home" />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), { target: { value: "a@b.co" } });
    fireEvent.click(screen.getByText("Send link"));

    await waitFor(() => expect(screen.getByText("Check your inbox.")).toBeTruthy());
    expect(firstArg(auth.signInWithOtp).options.emailRedirectTo).toBe(
      `${window.location.origin}/auth/callback?next=%2Fhome`,
    );
  });

  it("shows a refused handoff and lets them try again", async () => {
    asVisitor();
    auth.signInWithOAuth.mockResolvedValue({ error: { message: "Provider is not enabled" } });

    render(<LoginForm defaultNext="/home" />);
    fireEvent.click(screen.getByText("Continue with Google"));

    await waitFor(() => expect(screen.getByText("Provider is not enabled")).toBeTruthy());
    expect((screen.getByText("Continue with Google").closest("button") as HTMLButtonElement).disabled).toBe(false);
  });

  it("says so when the callback bounced an expired link", () => {
    searchParams = new URLSearchParams({ error: "link", reason: "exchange" });
    render(<LoginForm defaultNext="/home" />);
    expect(screen.getByRole("alert").textContent).toMatch(/expired or was already used/);
  });
});

/**
 * Which door a guest goes through. Someone who made something before signing
 * in has an anonymous account that already OWNS it, so the right move is to
 * link an identity onto it rather than sign into a second account. The
 * fallback matters as much as the happy path: linking fails when that Google
 * account is already a user, and it fails after the round trip, so
 * /auth/callback sends them back with `signin=force`. Ignoring that flag
 * would link again and bounce forever.
 */
describe("LoginForm — guest upgrade (linkAnonymous)", () => {
  it("links onto a guest's anonymous account instead of replacing it", async () => {
    asGuest();
    searchParams = new URLSearchParams({ next: "/claim/tok-abc" });

    render(<LoginForm defaultNext="/home" linkAnonymous />);
    fireEvent.click(screen.getByText("Continue with Google"));

    await waitFor(() => expect(auth.linkIdentity).toHaveBeenCalled());
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
    // `link=1` is what lets /auth/callback recognise a refused link and recover.
    const redirectTo = firstArg(auth.linkIdentity).options.redirectTo;
    expect(redirectTo).toContain("link=1");
    expect(redirectTo).toContain(encodeURIComponent("/claim/tok-abc"));
  });

  it("signs in normally for an ordinary visitor", async () => {
    asVisitor();

    render(<LoginForm defaultNext="/home" linkAnonymous />);
    fireEvent.click(screen.getByText("Continue with Google"));

    await waitFor(() => expect(auth.signInWithOAuth).toHaveBeenCalled());
    expect(auth.linkIdentity).not.toHaveBeenCalled();
    expect(firstArg(auth.signInWithOAuth).options.redirectTo).not.toContain("link=1");
  });

  it("obeys signin=force, so a refused link can't loop", async () => {
    asGuest();
    searchParams = new URLSearchParams({ next: "/claim/tok-abc", signin: "force" });

    render(<LoginForm defaultNext="/home" linkAnonymous />);
    fireEvent.click(screen.getByText("Continue with Google"));

    await waitFor(() => expect(auth.signInWithOAuth).toHaveBeenCalled());
    expect(auth.linkIdentity).not.toHaveBeenCalled();
  });

  it("falls through to signing in when linking isn't available at all", async () => {
    asGuest();
    auth.linkIdentity.mockResolvedValue({ error: { message: "Manual linking is disabled" } });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    render(<LoginForm defaultNext="/home" linkAnonymous />);
    fireEvent.click(screen.getByText("Continue with Google"));

    await waitFor(() => expect(auth.signInWithOAuth).toHaveBeenCalled());
  });

  it("leaves a guest session alone in an app that didn't ask for linking", async () => {
    asGuest();

    render(<LoginForm defaultNext="/home" />);
    fireEvent.click(screen.getByText("Continue with Google"));

    await waitFor(() => expect(auth.signInWithOAuth).toHaveBeenCalled());
    expect(auth.getUser).not.toHaveBeenCalled();
    expect(auth.linkIdentity).not.toHaveBeenCalled();
  });
});

/**
 * Inside a desktop shell Google refuses OAuth in-window, so every redirect
 * target becomes the app's return page and every OAuth call hands its
 * authorize URL to the system browser instead of navigating this window.
 */
describe("LoginForm — desktop shell", () => {
  const authorizeUrl = "https://accounts.google.com/o/oauth2/authorize?...";
  let inShell = true;
  const desktop: DesktopAuth = {
    isDesktop: () => inShell,
    redirectTo: (next) => `${window.location.origin}/desktop/return?next=${encodeURIComponent(next)}`,
    defaultNext: "/desktop/home",
    signedOutPath: "/desktop/welcome",
    openExternal: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    inShell = true;
    auth.signInWithOAuth.mockResolvedValue({ data: { url: authorizeUrl }, error: null });
  });

  it("opens the authorize URL in the system browser instead of navigating", async () => {
    asVisitor();

    render(<LoginForm defaultNext="/home" desktop={desktop} />);
    fireEvent.click(screen.getByText("Continue with Google"));

    await waitFor(() => expect(desktop.openExternal).toHaveBeenCalledWith(authorizeUrl));
    const { redirectTo, skipBrowserRedirect } = firstArg(auth.signInWithOAuth).options;
    expect(redirectTo).toBe(`${window.location.origin}/desktop/return?next=%2Fdesktop%2Fhome`);
    expect(skipBrowserRedirect).toBe(true);
    expect(screen.getByText("Finish signing in in your browser.")).toBeTruthy();
  });

  it("uses the plain web flow when the same app runs in a browser", async () => {
    inShell = false;
    asVisitor();
    auth.signInWithOAuth.mockResolvedValue({ error: null });

    render(<LoginForm defaultNext="/home" desktop={desktop} />);
    fireEvent.click(screen.getByText("Continue with Google"));

    await waitFor(() => expect(auth.signInWithOAuth).toHaveBeenCalled());
    expect(firstArg(auth.signInWithOAuth).options).toEqual({
      redirectTo: `${window.location.origin}/auth/callback?next=%2Fhome`,
    });
    expect(desktop.openExternal).not.toHaveBeenCalled();
  });

  it("keeps link=1 when linking a guest from the shell", async () => {
    asGuest();
    auth.linkIdentity.mockResolvedValue({ data: { url: authorizeUrl }, error: null });
    searchParams = new URLSearchParams({ next: "/claim/tok-abc" });

    render(<LoginForm defaultNext="/home" desktop={desktop} linkAnonymous />);
    fireEvent.click(screen.getByText("Continue with Google"));

    await waitFor(() => expect(desktop.openExternal).toHaveBeenCalledWith(authorizeUrl));
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
    const { redirectTo, skipBrowserRedirect } = firstArg(auth.linkIdentity).options;
    expect(redirectTo).toBe(`${window.location.origin}/desktop/return?next=%2Fclaim%2Ftok-abc&link=1`);
    expect(skipBrowserRedirect).toBe(true);
  });

  it("points the magic-link email back at the app", async () => {
    asVisitor();

    render(<LoginForm defaultNext="/home" desktop={desktop} />);
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), { target: { value: "person@example.com" } });
    fireEvent.click(screen.getByText("Send link"));

    await waitFor(() => expect(auth.signInWithOtp).toHaveBeenCalled());
    expect(firstArg(auth.signInWithOtp).options.emailRedirectTo).toBe(
      `${window.location.origin}/desktop/return?next=%2Fdesktop%2Fhome`,
    );
    // Sending an email never navigates anything.
    expect(desktop.openExternal).not.toHaveBeenCalled();
  });

  it("recovers from a refused openExternal instead of stranding them on a spinner", async () => {
    asVisitor();
    vi.mocked(desktop.openExternal).mockRejectedValueOnce(new Error("blocked"));

    render(<LoginForm defaultNext="/home" desktop={desktop} />);
    fireEvent.click(screen.getByText("Continue with Google"));

    await waitFor(() => expect(screen.getByText("blocked")).toBeTruthy());
    expect(screen.getByText("Continue with Google")).toBeTruthy();
  });
});
