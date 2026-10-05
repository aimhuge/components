"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { DesktopAuth } from "../desktop.js";
import { getSupabaseBrowser } from "./supabase-browser.js";

export type UseAuthOptions = {
  /** Pass a module-level constant: it is read on every call, never memoised. */
  desktop?: DesktopAuth;
};

/**
 * The signed-in user, kept current through Supabase's auth events, plus the
 * two actions every app needs outside the sign-in page.
 *
 * Apps wrap this once (`lib/hooks/useAuth.ts`) to bind their own options, so
 * call sites stay `useAuth()`.
 */
export function useAuth({ desktop }: UseAuthOptions = {}) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = getSupabaseBrowser();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  /**
   * Start Google sign-in, landing on `redirectTo` afterwards. On the web,
   * success means supabase-js is already navigating to Google, so this only
   * really resolves when that did NOT happen; the error is handed back so a
   * caller can keep its spinner up until the page actually leaves.
   */
  const signInWithGoogle = async (redirectTo?: string): Promise<{ error: Error | null }> => {
    if (desktop?.isDesktop()) {
      // Google refuses OAuth inside the shell's window: open the authorize URL
      // in the system browser and wait for the round trip to come back to the
      // app (DesktopAuth.redirectTo).
      const next = redirectTo && redirectTo !== "/" ? redirectTo : desktop.defaultNext;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: desktop.redirectTo(next), skipBrowserRedirect: true },
      });
      if (error) return { error };
      await desktop.openExternal(data.url);
      return { error: null };
    }

    // The callback URL must match an allowed Redirect URL in Supabase, or the
    // project must allow a wildcard (e.g. http://localhost:4001/**), or the
    // `?next=` makes the match fail.
    const query = redirectTo && redirectTo !== "/" ? `?next=${encodeURIComponent(redirectTo)}` : "";
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback${query}` },
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    // The shell has exactly one place to land once signed out. Doing it here
    // means no caller pushes its own route as well, which would race this one.
    if (desktop?.isDesktop()) window.location.href = desktop.signedOutPath;
  };

  // Supabase anonymous sessions are real users with `is_anonymous` set. That
  // one flag is the whole difference between "signed in" and "working as a
  // guest who hasn't claimed their work yet".
  const isGuest = user?.is_anonymous === true;

  return { user, loading, isGuest, signInWithGoogle, signOut };
}
