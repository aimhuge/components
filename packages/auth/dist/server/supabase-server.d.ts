/**
 * The request-scoped Supabase client: reads and writes the session cookies
 * through Next's `cookies()`. Reads `NEXT_PUBLIC_SUPABASE_URL` and
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
 */
export declare function getSupabaseServer(): Promise<import("@supabase/supabase-js").SupabaseClient<any, "public", "public", any, any>>;
