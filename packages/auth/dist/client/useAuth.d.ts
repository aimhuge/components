import type { User } from "@supabase/supabase-js";
import type { DesktopAuth } from "../desktop.js";
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
export declare function useAuth({ desktop }?: UseAuthOptions): {
    user: User | null;
    loading: boolean;
    isGuest: boolean;
    signInWithGoogle: (redirectTo?: string) => Promise<{
        error: Error | null;
    }>;
    signOut: () => Promise<void>;
};
