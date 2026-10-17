import type { ShareMode } from "../modes.js";
/** Full-screen unlock prompt for a gated share link. It POSTs `{ email }` or
 *  `{ password }` to `unlockUrl`; on success the server has set a signed pass
 *  cookie (`grantGatePass`), and the page reloads into the real view.
 *
 *  mode — "email" asks for an email; any other mode asks for the password.
 *  purpose — which door this is. The same email gate can guard the content and,
 *    on a link-edit resource, its editor; only the copy differs.
 *  knownEmail — this browser's signed-in address, or the one it last gave at any
 *    gate. Prefilled so a returning visitor just clicks through; still editable,
 *    and nothing is recorded against it until they submit.
 *  seenUrl — optional: POSTed once on mount for an email gate, so the owner sees
 *    gate drop-off, not just the people who made it through. */
export declare function ShareGateForm({ title, mode, unlockUrl, seenUrl, knownEmail, purpose, noun, onUnlocked, reload, }: {
    title: string;
    mode: ShareMode;
    unlockUrl: string;
    seenUrl?: string;
    knownEmail?: string | null;
    purpose?: "view" | "edit";
    noun?: string;
    /** Runs before the reload, e.g. to identify the visitor in analytics. Gets the
     *  normalized email on an email gate, null on a password gate. */
    onUnlocked?: (email: string | null) => void;
    reload?: () => void;
}): import("react").JSX.Element;
