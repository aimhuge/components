// Server-side entry point. The client components live under /client but
// are re-exported from the package root as well, so apps can write
// `import { AddMemberForm } from "@aimhuge/teams"` without subpaths.
export { createServiceClient } from "./supabase.js";
export { requireOrg, sessionClaims, orgAccessTag, userAccessTag, invalidateOrgAccess } from "./gate.js";
export type { OrgContext, TeamClients, SessionClaims } from "./gate.js";
export {
  listUserOrgs,
  listOrgMembers,
  setCurrentOrg,
  ORG_ROLES,
} from "./members.js";
export type { Org, OrgRole, OrgMember } from "./members.js";
export {
  roleCan,
  roleAtLeast,
  effectivePermissions,
  roleLabel,
  roleDescription,
  assignableRoles,
} from "./permissions.js";
export type { Permission } from "./permissions.js";
export { normalizeEmail, isPlausibleEmail, escapeLikeWildcards } from "./email.js";
export { isSuperAdmin, SUPER_ADMIN_EMAILS } from "./super-admin-emails.js";
export { isReservedSlug, slugify, RESERVED_SLUGS } from "./slugs.js";
export { isSafeOrgSlug, ORG_SLUG_PATTERN } from "./slug-pattern.js";
export { siteOrigin } from "./site-origin.js";
export { reserveOrgSlug, createOrg, currentOrgForUser, ensureCurrentOrgSlug } from "./orgs.js";
export {
  createInvite,
  revokeInvite,
  lookupInviteByToken,
  acceptInvite,
  listPendingInvites,
  inviteClaimUrl,
  inviteEmailBody,
  mintInviteToken,
} from "./invites.js";
export type { Invitation, InviteLookup, InviteEmailTransport } from "./invites.js";
export {
  addMember,
  changeRole,
  removeMember,
  revokePendingInvite,
  configureTeamActions,
} from "./actions.js";
export type { ActionResult, TeamActionsConfig } from "./actions.js";

// Re-export the client components too. A Server Component can import these
// and get client references.
export { AddMemberForm } from "../client/AddMemberForm.js";
export { TeamRoster } from "../client/TeamRoster.js";
export { PendingInviteList } from "../client/PendingInviteList.js";
export { OrgProvider, useOrg } from "../client/OrgProvider.js";
export type { OrgContextValue } from "../client/OrgProvider.js";