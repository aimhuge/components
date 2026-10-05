"use client";
import { createBrowserClient } from "@supabase/ssr";
/**
 * The browser Supabase client. `createBrowserClient` keeps one instance per
 * page, so calling this on every render is cheap and always the same client.
 */
export function getSupabaseBrowser() {
    return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
