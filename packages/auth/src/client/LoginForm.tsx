"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Loader2, MailCheck } from "lucide-react";
import { GoogleG } from "./GoogleG.js";
import { useLoginFlow, type LoginFlowOptions } from "./useLoginFlow.js";

export type LoginFormProps = LoginFlowOptions;

/**
 * "Continue with Google" plus a magic-link email field. No passwords.
 *
 * The default look for `useLoginFlow`, which owns every behaviour (guest
 * upgrade, the desktop-shell round trip, the `signin=force` loop guard). An
 * app that wants a different form calls the hook and draws its own.
 *
 * Must render inside a <Suspense> boundary. Colours come from the `auth-*`
 * tokens in auth.css.
 */
export function LoginForm(props: LoginFormProps) {
  const { busy, error, sentTo, awaitingBrowser, signInWithGoogle, sendMagicLink, reset } = useLoginFlow(props);
  const [email, setEmail] = useState("");

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void sendMagicLink(email);
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
          onClick={reset}
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
          onClick={reset}
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
        onClick={() => void signInWithGoogle()}
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

      <form onSubmit={onSubmit}>
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
