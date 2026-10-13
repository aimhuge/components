// Client-safe entry point: roles, permissions, slugs and email helpers, with
// no Supabase client, no next/headers and no "use cache" behind them. A
// "use client" component imports from here:
//   import { roleLabel, assignableRoles } from "@aimhuge/teams/roles";
// The package root also exports the gate, which only a Server Component or a
// route may pull in — a client component that imports the root fails the
// Next build.
export { ORG_ROLES } from "./server/members.js";
export type { Org, OrgRole, OrgMember } from "./server/members.js";
export {
  roleCan,
  roleAtLeast,
  effectivePermissions,
  roleLabel,
  roleDescription,
  assignableRoles,
} from "./server/permissions.js";
export type { Permission } from "./server/permissions.js";
export { normalizeEmail, isPlausibleEmail, escapeLikeWildcards } from "./server/email.js";
export { isReservedSlug, slugify, RESERVED_SLUGS } from "./server/slugs.js";
export { isSafeOrgSlug, ORG_SLUG_PATTERN } from "./server/slug-pattern.js";
export type { Invitation } from "./server/invites.js";
