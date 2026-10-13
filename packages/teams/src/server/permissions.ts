/**
 * Workspace permissions model.
 *
 * Three roles, flat permission enum. Roles map to the set of permissions they
 * hold; `roleCan(role, permission)` is the one function the gate, server
 * actions, and UI reach for. Adding a new permission is a 1-line enum + 1-line
 * role-set edit; the rest of the codebase compiles because `roleCan` returns
 * false by default for any (role, permission) not explicitly granted.
 *
 * The set of permissions is short and every entry is something a server
 * action actually enforces somewhere — see `./actions.ts` and the canEdit
 * checks in the property settings tree.
 *
 * Super-admins (the platform staff allowlist in
 * `./super-admin-emails.ts`) hold every permission regardless of role, via
 * `effectivePermissions`.
 */
import type { OrgRole } from "./members";

export type Permission =
  /** Manage workspace settings, billing, delete. Owners + admins. */
  | "workspace.manage"
  /** Invite new members, change roles, remove members. */
  | "members.manage"
  /** Publish/schedule/delete posts without owner approval. */
  | "posts.publish"
  /** Approve queued posts (only meaningful when require_post_approval is on). */
  | "posts.approve"
  /** Create / edit / delete channels (LinkedIn, Threads, Meta). */
  | "channels.manage"
  /** Create / edit / delete properties under the workspace. */
  | "properties.manage"
  /** View all properties, drafts, history. Members and above. */
  | "workspace.view";

const ROLE_PERMISSIONS: Record<OrgRole, ReadonlySet<Permission>> = {
  owner: new Set<Permission>([
    "workspace.manage",
    "members.manage",
    "posts.publish",
    "posts.approve",
    "channels.manage",
    "properties.manage",
    "workspace.view",
  ]),
  admin: new Set<Permission>([
    "workspace.manage",
    "members.manage",
    "posts.publish",
    "posts.approve",
    "channels.manage",
    "properties.manage",
    "workspace.view",
  ]),
  member: new Set<Permission>(["posts.publish", "workspace.view"]),
};

/** Higher rank = more authority. Used by `requireAtLeast` and the UI for
 *  ordering ("owners at the top"). */
const ROLE_RANK: Record<OrgRole, number> = {
  owner: 3,
  admin: 2,
  member: 1,
};

/** The role can perform the action. Super-admin override is layered on top of
 *  this in `effectivePermissions`. */
export function roleCan(role: OrgRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

/** `true` when `actor` is at least as senior as `target` — used to forbid an
 *  admin from removing an owner, or re-rolling an owner into a member. */
export function roleAtLeast(actor: OrgRole, target: OrgRole): boolean {
  return ROLE_RANK[actor] >= ROLE_RANK[target];
}

/** All permissions the caller holds, factoring in the platform-staff override.
 *  Cheap; called from server components, not from render hot paths. */
export function effectivePermissions(
  role: OrgRole,
  isSuperAdmin: boolean,
): Set<Permission> {
  if (isSuperAdmin) {
    return new Set<Permission>([
      "workspace.manage",
      "members.manage",
      "posts.publish",
      "posts.approve",
      "channels.manage",
      "properties.manage",
      "workspace.view",
    ]);
  }
  return new Set(ROLE_PERMISSIONS[role]);
}

/** Human-readable label for a role, used in the roster / role select. */
export function roleLabel(role: OrgRole): string {
  switch (role) {
    case "owner":
      return "Owner";
    case "admin":
      return "Admin";
    case "member":
      return "Member";
  }
}

/** What a person with this role can do, in one sentence. Shown next to the
 *  role select on the Team invite form so the inviter doesn't have to guess.
 *  Order matches the form (Owner, Admin, Member top-to-bottom). */
export function roleDescription(role: OrgRole): string {
  switch (role) {
    case "owner":
      return "Full control: manage the workspace, billing, members, and every property.";
    case "admin":
      return "Manage the workspace, members, channels, and properties. Can do everything except transfer ownership.";
    case "member":
      return "Publish and schedule posts and view the workspace. Cannot manage settings, members, or channels.";
  }
}

/** Roles the caller is allowed to assign to someone else. An admin cannot
 *  promote to owner (only owners can); an owner can do anything. */
export function assignableRoles(actor: OrgRole): OrgRole[] {
  if (actor === "owner") return ["owner", "admin", "member"];
  if (actor === "admin") return ["admin", "member"];
  return [];
}