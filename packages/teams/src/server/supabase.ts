/**
 * Build a service-role Supabase client from an explicit env. Apps pass in
 * the URL + key at startup so this package has no opinion about how the
 * app reads its environment.
 */
import { createClient } from "@supabase/supabase-js";

export function createServiceClient(opts: {
  url: string;
  serviceRoleKey: string;
}) {
  return createClient(opts.url, opts.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}