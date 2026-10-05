import type { SessionIdentity } from "../identity.js";
/**
 * The "you're already signed in as …" banner, shown above the sign-in form
 * when a returning visitor lands on /login with a live session. They can go
 * straight on to `next`, or sign out and use another account, instead of
 * staring at a form they don't need.
 *
 * Two rows: the identity (full card width, so a long name isn't cut to
 * "Alex …" on a phone), then Continue (primary, takes the rest of the row) and
 * Switch account (content-sized). The macOS / GitHub / Linear pattern.
 */
export declare function SignedInPrompt({ identity, next }: {
    identity: SessionIdentity;
    next: string;
}): import("react").JSX.Element;
