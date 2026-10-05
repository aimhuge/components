"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation.js";
import { ArrowRight, Loader2, MailCheck } from "lucide-react";
import type { DesktopAuth } from "../desktop.js";
import { GoogleG } from "./GoogleG.js";
import { getSupabaseBrowser } from "./supabase-browser.js";

const LINK_EXPIRED = "That link expired or was already used. Send a fresh one.";

export type LoginFormProps = {
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

/**
 * "Continue with Google" plus a magic-link email field. No passwords.
 *
 * Reads three things off the URL: `next` (where to go afterwards; the callback
 * re-sanitizes it, so a hostile value can't redirect off-site), `error=link`
 * (the callback's "that link didn't work") and `signin=force` (a refused
 * identity link: sign in plainly instead of linking again).
 *
 * Must render inside a <Suspense> boundary, like anything that calls
 * useSearchParams. Colours come from the `auth-*` tokens in auth.css.
 */
export function LoginForm({ defaultNext, desktop, linkAnonymous = false }: LoginFormProps) {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [awaitingBrowser, setAwaitingBrowser] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error") === "link" ? LINK_EXPIRED : null);
  // Which action is in flight. One flag per action, so sending a magic link
  // doesn't spin the Google button and vice versa.
  const [busy, setBusy] = useState<"google" | "email" | null>(null);

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

  // Shell only: hand the authorize URL to the system browser and show the
  // "finish in your browser" state until the app comes back to this window as
  // a fresh page load. There's nothing else for the window to do meanwhile.
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
    // On the web the browser is already on its way to Google: leave the
    // spinner up rather than flicking the button back to idle mid-redirect.
    if (shell) await openInSystemBrowser(data.url);
  };

  const sendMagicLink = async (e: FormEvent) => {
    e.preventDefault();
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

  if (sentTo) {
    return (
      <div className="flex flex-col items-center text-center py-2 animate-auth-scale-in">
        <MailCheck className="w-10 h-10 text-accent mb-3" aria-hidden="true" />
        <h2 className="font-display text-xl font-bold text-auth-ink">Check your inbox.</h2>
        <p className="mt-1.5 text-sm text-auth-muted max-w-[36ch]">
          A sign-in link is on its way to <span className="font-semibold text-auth-ink">{sentTo}</span>. Open it on this
          device.
        </p>
        <button
          type="button"
          onClick={() => setSentTo(null)}
          className="mt-5 font-mono text-[11px] text-auth-muted underline underline-offset-4 hover:text-auth-ink"
        >
          use a different email
        </button>
      </div>
    );
  }

  if (awaitingBrowser) {
    return (
      <div className="flex flex-col items-center text-center py-2 animate-auth-scale-in">
        <Loader2 className="w-10 h-10 text-accent mb-3 animate-spin" aria-hidden="true" />
        <h2 className="font-display text-xl font-bold text-auth-ink">Finish signing in in your browser.</h2>
        <p className="mt-1.5 text-sm text-auth-muted max-w-[36ch]">
          We opened your default browser to continue with Google. Come back to this window once you&apos;re done —
          it&apos;ll pick up from there.
        </p>
        <button
          type="button"
          onClick={() => {
            setAwaitingBrowser(false);
            setBusy(null);
            setError(null);
          }}
          className="mt-5 font-mono text-[11px] text-auth-muted underline underline-offset-4 hover:text-auth-ink"
        >
          try again
        </button>
      </div>
    );
  }

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={busy !== null}
        aria-busy={busy === "google"}
        className="w-full flex items-center justify-center gap-2.5 border-[1.5px] border-auth-field-ink/15 hover:border-auth-field-ink/40 bg-auth-field text-auth-field-ink rounded-md px-4 py-2.5 text-sm font-semibold transition duration-150 disabled:opacity-50"
      >
        {busy === "google" ? (
          <>
            <Loader2 className="w-4.5 h-4.5 animate-spin" aria-hidden="true" />
            Redirecting to Google&hellip;
          </>
        ) : (
          <>
            <GoogleG className="w-4.5 h-4.5" />
            Continue with Google
          </>
        )}
      </button>

      <div className="flex items-center gap-3 my-5" aria-hidden="true">
        <span className="flex-1 border-t border-auth-ink/10" />
        <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-auth-muted">or</span>
        <span className="flex-1 border-t border-auth-ink/10" />
      </div>

      <form onSubmit={sendMagicLink}>
        <label htmlFor="login-email" className="block font-mono text-[11px] text-auth-muted mb-1.5">
          email — we&apos;ll send a magic link, no password
        </label>
        <div className="flex items-center gap-2">
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            required
            disabled={busy !== null}
            className="flex-1 min-w-0 bg-auth-field border-[1.5px] border-auth-field-ink/15 rounded-md px-3.5 py-2.5 text-sm text-auth-field-ink placeholder:text-auth-field-ink/40 focus:outline-none focus:border-accent transition duration-150 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={busy !== null || !email}
            className="flex items-center justify-center bg-accent hover:bg-accent-hover text-accent-ink rounded-md px-4 py-2.5 text-sm font-semibold transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed group/btn whitespace-nowrap"
          >
            {busy === "email" ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-label="Sending" />
            ) : (
              <>
                Send link
                <ArrowRight
                  className="w-4 h-4 ml-1.5 transform group-hover/btn:translate-x-0.5 transition-transform"
                  aria-hidden="true"
                />
              </>
            )}
          </button>
        </div>
      </form>

      {error && (
        <p className="mt-3 text-xs text-rose-600 animate-auth-fade-in" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
