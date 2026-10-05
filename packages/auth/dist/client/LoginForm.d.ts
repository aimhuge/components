import type { DesktopAuth } from "../desktop.js";
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
export declare function LoginForm({ defaultNext, desktop, linkAnonymous }: LoginFormProps): import("react").JSX.Element;
