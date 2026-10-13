/**
 * Server-side gate for `/admin/*` routes. Throws `notFound()` when the caller's
 * email is not on the platform super-admin allowlist, so unauthorized traffic
 * sees a 404, not a 403 (a 403 leaks the route's existence).
 *
 * Built on `@aimhuge/teams`'s `isSuperAdmin`, which reads `SUPER_ADMIN_EMAILS`.
 * Apps that already have a richer source of truth (a `users.is_super_admin`
 * column, a role on the org membership) should layer their own check on top —
 * this is the cross-app baseline.
 */
import { notFound } from "next/navigation";
import { isSuperAdmin } from "@aimhuge/teams";

export interface AdminCaller {
  email: string | null | undefined;
}

/**
 * Throw a 404 unless the caller is on `SUPER_ADMIN_EMAILS`. The Next.js
 * `notFound()` helper short-circuits the request to the closest `not-found.tsx`.
 *
 * Returns the normalized email on success so the page can read it back without
 * a second call.
 */
export function requireSuperAdmin(caller: AdminCaller): string {
  if (!isSuperAdmin(caller.email)) {
    notFound();
  }
  // `isSuperAdmin` already normalized; trust the input back.
  return caller.email ?? "";
}

/**
 * Non-throwing variant. Returns `true` if the caller is a super-admin,
 * `false` otherwise. Use this when a page renders differently for admins
 * (e.g. to show a "you can act as this org" toggle) rather than denying
 * access outright.
 */
export function isAdminCaller(caller: AdminCaller): boolean {
  return isSuperAdmin(caller.email);
}
