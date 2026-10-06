import type { DesktopAuth } from "../desktop.js";
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
    /**
     * The app's own Google route (`createGoogleStart`), e.g. "/auth/google".
     * Set, the Google button goes there instead of Supabase's hosted flow, so
     * Google returns to this domain and `supabase.co` needn't be an authorized
     * domain on the Google project. Web only: in a desktop shell, and when a
     * guest is upgraded (`linkAnonymous`), the hosted flow still runs.
     */
    googleSignInPath?: string;
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
export declare function useLoginFlow({ defaultNext, desktop, linkAnonymous, googleSignInPath }: LoginFlowOptions): LoginFlow;
