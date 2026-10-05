"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation.js";
import type { DesktopAuth } from "../desktop.js";
import { getSupabaseBrowser } from "./supabase-browser.js";

const LINK_EXPIRED = "That link expired or was already used. Send a fresh one.";

export type LoginFlowOptions = {
  /** Where to land after sign-in when the URL has no `?next=`. */
  defaultNext: string;
  /** The app's desktop shell, if it has one. */
  desktop?: DesktopAuth;
  /**
   * Upgrade an anonymous (guest) session instead of replacing it: link the
   * Google identity onto it, so whatever the guest already owns simply becomes
   * theirs. For apps that hand out guest sessions before sign-in.
   */
  linkAnonymous?: boolean;
};

export type LoginFlow = {
  /** Which action is in flight. One per action, so a magic link doesn't spin the Google button. */
  busy: "google" | "email" | null;
  /** What went wrong, in words fit to show. Includes the callback's "that link expired". */
  error: string | null;
  /** Set once a magic link is on its way: the address it went to. */
  sentTo: string | null;
  /** Shell only: the authorize page is open in the system browser, and this window is waiting. */
  awaitingBrowser: boolean;
  /**
   * Start Google sign-in. On the web, success navigates away and `busy` stays
   * "google" until it does; a refused handoff lands in `error`.
   */
  signInWithGoogle: () => Promise<void>;
  /** Email a magic link. Success sets `sentTo`. */
  sendMagicLink: (email: string) => Promise<void>;
  /** Back to the plain form: "use a different email", "try again". */
  reset: () => void;
};

/**
 * The sign-in flow with no UI: everything `LoginForm` does, for an app that
 * wants to draw its own form. `LoginForm` is just the default look on top of it.
 *
 * Reads three things off the URL: `next` (where to go afterwards; the callback
 * re-sanitizes it, so a hostile value can't redirect off-site), `error=link`
 * (the callback's "that link didn't work") and `signin=force` (a refused
 * identity link: sign in plainly instead of linking again). So, like anything
 * that calls useSearchParams, the component using it must sit inside <Suspense>.
 */
export function useLoginFlow({ defaultNext, desktop, linkAnonymous = false }: LoginFlowOptions): LoginFlow {
  const params = useSearchParams();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [awaitingBrowser, setAwaitingBrowser] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error") === "link" ? LINK_EXPIRED : null);
  const [busy, setBusy] = useState<LoginFlow["busy"]>(null);

  const forcePlainSignIn = params.get("signin") === "force";

  // Both read at click time. isDesktop() looks at `window`, which the server
  // render doesn't have, so it must never decide anything that renders.
  const inShell = () => desktop?.isDesktop() === true;
  const nextPath = () => params.get("next") || (inShell() && desktop ? desktop.defaultNext : defaultNext);

  // Where Supabase sends the browser back to. On the web that's this origin's
  // /auth/callback. In a shell it's the app's own return page, which hands the
  // round trip back to the app instead of leaving it in a browser tab.
  // `link=1` marks a linking attempt, so the callback can recover if it's refused.
  const redirectTo = (linking = false) => {
    const next = nextPath();
    const base =
      inShell() && desktop
        ? desktop.redirectTo(next)
        : `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    return linking ? `${base}${base.includes("?") ? "&" : "?"}link=1` : base;
  };

  // Shell only: hand the authorize URL to the system browser and wait until
  // the app comes back to this window as a fresh page load. There's nothing
  // else for the window to do meanwhile.
  const openInSystemBrowser = async (url: string) => {
    setAwaitingBrowser(true);
    try {
      await desktop?.openExternal(url);
    } catch (err) {
      setAwaitingBrowser(false);
      setBusy(null);
      setError(err instanceof Error ? err.message : "Couldn't open your browser. Try again.");
    }
  };

  const signInWithGoogle = async () => {
    setError(null);
    setBusy("google");
    const supabase = getSupabaseBrowser();
    const shell = inShell();
    // skipBrowserRedirect: in a shell this window must not navigate to Google.
    const oauthOptions = (linking: boolean) =>
      shell ? { redirectTo: redirectTo(linking), skipBrowserRedirect: true } : { redirectTo: redirectTo(linking) };

    // A guest gets their anonymous account UPGRADED rather than replaced. It
    // fails when that Google account already belongs to someone, and it fails
    // late (after the round trip), so the recovery lives in /auth/callback,
    // which sends them back here with `signin=force`.
    if (linkAnonymous && !forcePlainSignIn) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.is_anonymous === true) {
        const { data, error } = await supabase.auth.linkIdentity({ provider: "google", options: oauthOptions(true) });
        if (!error) {
          if (shell) await openInSystemBrowser(data.url);
          return; // navigating to Google (web), or waiting on the system browser (shell)
        }
        // Manual linking switched off, or the provider refused outright.
        // Signing in plainly still gets them in, so fall through rather than
        // stranding them here.
        console.warn("[login] identity linking unavailable, signing in instead:", error.message);
      }
    }

    const { data, error } = await supabase.auth.signInWithOAuth({ provider: "google", options: oauthOptions(false) });
    if (error) {
      setError(error.message);
      setBusy(null);
      return;
    }
    // On the web the browser is already on its way to Google: leave `busy`
    // set rather than flicking the button back to idle mid-redirect.
    if (shell) await openInSystemBrowser(data.url);
  };

  const sendMagicLink = async (email: string) => {
    if (!email) return;
    setError(null);
    setBusy("email");
    // Sending an email navigates nothing, so the shell needs no system
    // browser here. Only the destination changes: the link is clicked later,
    // in some mail client, and has to come back to the app.
    const { error } = await getSupabaseBrowser().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo() },
    });
    if (error) setError(error.message);
    else setSentTo(email);
    setBusy(null);
  };

  const reset = () => {
    setSentTo(null);
    setAwaitingBrowser(false);
    setBusy(null);
    setError(null);
  };

  return { busy, error, sentTo, awaitingBrowser, signInWithGoogle, sendMagicLink, reset };
}
