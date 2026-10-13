/**
 * Super-admin allowlist — gates internal surfaces (dashboard, token terminal,
 * analytics) until real roles/billing exist. These are staff above the
 * workspace role hierarchy, not workspace owners/admins.
 *
 * Read from `SUPER_ADMIN_EMAILS` (comma-separated) rather than hardcoded, so
 * staff can change per-environment without a code change.
 */
import { normalizeEmail } from "./email";

function loadSuperAdminEmails(): string[] {
  const raw = process.env.SUPER_ADMIN_EMAILS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}

export const SUPER_ADMIN_EMAILS = loadSuperAdminEmails();

/**
 * Is this address on the allowlist?
 *
 * Use this rather than touching SUPER_ADMIN_EMAILS directly. Normalizes BOTH
 * sides, so it is safe to hand an address straight off the auth row, and
 * idempotent for callers that already normalized. Null/undefined in, false
 * out, so callers don't need their own `!!email &&` guard.
 */
export function isSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const subject = normalizeEmail(email);
  return SUPER_ADMIN_EMAILS.some((allowed) => normalizeEmail(allowed) === subject);
}