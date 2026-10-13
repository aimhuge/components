export declare const SUPER_ADMIN_EMAILS: string[];
/**
 * Is this address on the allowlist?
 *
 * Use this rather than touching SUPER_ADMIN_EMAILS directly. Normalizes BOTH
 * sides, so it is safe to hand an address straight off the auth row, and
 * idempotent for callers that already normalized. Null/undefined in, false
 * out, so callers don't need their own `!!email &&` guard.
 */
export declare function isSuperAdmin(email: string | null | undefined): boolean;
