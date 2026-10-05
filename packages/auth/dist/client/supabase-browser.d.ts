/**
 * The browser Supabase client. `createBrowserClient` keeps one instance per
 * page, so calling this on every render is cheap and always the same client.
 */
export declare function getSupabaseBrowser(): import("@supabase/supabase-js").SupabaseClient<any, "public", "public", any, any>;
