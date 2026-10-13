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
"workspace.manage"
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
/** The role can perform the action. Super-admin override is layered on top of
 *  this in `effectivePermissions`. */
export declare function roleCan(role: OrgRole, permission: Permission): boolean;
/** `true` when `actor` is at least as senior as `target` — used to forbid an
 *  admin from removing an owner, or re-rolling an owner into a member. */
export declare function roleAtLeast(actor: OrgRole, target: OrgRole): boolean;
/** All permissions the caller holds, factoring in the platform-staff override.
 *  Cheap; called from server components, not from render hot paths. */
export declare function effectivePermissions(role: OrgRole, isSuperAdmin: boolean): Set<Permission>;
/** Human-readable label for a role, used in the roster / role select. */
export declare function roleLabel(role: OrgRole): string;
/** What a person with this role can do, in one sentence. Shown next to the
 *  role select on the Team invite form so the inviter doesn't have to guess.
 *  Order matches the form (Owner, Admin, Member top-to-bottom). */
export declare function roleDescription(role: OrgRole): string;
/** Roles the caller is allowed to assign to someone else. An admin cannot
 *  promote to owner (only owners can); an owner can do anything. */
export declare function assignableRoles(actor: OrgRole): OrgRole[];
