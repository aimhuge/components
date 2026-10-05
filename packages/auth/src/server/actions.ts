"use server";

import { revalidatePath } from "next/cache.js";
import { redirect } from "next/navigation.js";
import { safeNextPath } from "../next-path.js";
import { getSupabaseServer } from "./supabase-server.js";

/**
 * Sign the current user out and go back to `/login`, keeping `next` when it is
 * a same-origin path so the visitor lands on the form for the same target.
 *
 * The banner's "Switch account" button calls this through a `<form action>`,
 * so it is a real POST and not a GET someone could be tricked into firing.
 */
export async function signOutAndRedirect(currentPath?: string): Promise<void> {
  const supabase = await getSupabaseServer();
  await supabase.auth.signOut();

  // The next render of /login has to re-read the (now cleared) session cookie.
  revalidatePath("/login", "page");

  const next = currentPath ? safeNextPath(currentPath, "") : "";
  redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
}
