import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers.js";
/**
 * The request-scoped Supabase client: reads and writes the session cookies
 * through Next's `cookies()`. Reads `NEXT_PUBLIC_SUPABASE_URL` and
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
 */
export async function getSupabaseServer() {
    const cookieStore = await cookies();
    return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        cookies: {
            getAll() {
                return cookieStore.getAll();
            },
            setAll(cookiesToSet) {
                // A background token refresh can fire while a Server Component is
                // rendering, where cookies are read-only and `set` throws. Swallow it:
                // the app's Proxy refreshes the session on every request and persists
                // the rotated cookies, so a write that fails here is already covered.
                // Route Handlers and Server Actions (the auth callback, sign-out) can
                // write, and those are the writes that matter.
                try {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        cookieStore.set(name, value, options);
                    });
                }
                catch {
                    // called from a Server Component render — safe to ignore
                }
            },
        },
    });
}
