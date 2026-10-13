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
export declare function requireSuperAdmin(caller: AdminCaller): string;
/**
 * Non-throwing variant. Returns `true` if the caller is a super-admin,
 * `false` otherwise. Use this when a page renders differently for admins
 * (e.g. to show a "you can act as this org" toggle) rather than denying
 * access outright.
 */
export declare function isAdminCaller(caller: AdminCaller): boolean;
