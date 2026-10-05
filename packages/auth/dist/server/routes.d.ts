import type { SupabaseClient, User } from "@supabase/supabase-js";
/** Handed to an app's `onSignedIn` hook once the session cookie is set. */
export type SignedInContext = {
    request: Request;
    supabase: SupabaseClient;
    user: User | null;
};
export type AuthRouteOptions = {
    /** Where to land when the link carries no usable `next`. */
    defaultNext: string;
    /** The sign-in page failures are sent back to. Default `/login`. */
    loginPath?: string;
    /**
     * The app's own bookkeeping after a successful sign-in (login stats, invite
     * reconciliation, …). Best-effort: a throw is logged and the redirect still
     * happens, because nothing an app records is worth stranding someone on a
     * blank callback page.
     */
    onSignedIn?: (ctx: SignedInContext) => Promise<void> | void;
};
/** `/login?error=link&reason=…` — the form reads `error=link` and says the link expired. */
export declare function failRedirect(origin: string, loginPath: string, reason: string): URL;
export declare function runOnSignedIn(label: string, request: Request, supabase: SupabaseClient, onSignedIn: AuthRouteOptions["onSignedIn"]): Promise<void>;
