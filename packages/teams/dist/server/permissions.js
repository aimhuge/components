const ROLE_PERMISSIONS = {
    owner: new Set([
        "workspace.manage",
        "members.manage",
        "posts.publish",
        "posts.approve",
        "channels.manage",
        "properties.manage",
        "workspace.view",
    ]),
    admin: new Set([
        "workspace.manage",
        "members.manage",
        "posts.publish",
        "posts.approve",
        "channels.manage",
        "properties.manage",
        "workspace.view",
    ]),
    member: new Set(["posts.publish", "workspace.view"]),
};
/** Higher rank = more authority. Used by `requireAtLeast` and the UI for
 *  ordering ("owners at the top"). */
const ROLE_RANK = {
    owner: 3,
    admin: 2,
    member: 1,
};
/** The role can perform the action. Super-admin override is layered on top of
 *  this in `effectivePermissions`. */
export function roleCan(role, permission) {
    return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}
/** `true` when `actor` is at least as senior as `target` — used to forbid an
 *  admin from removing an owner, or re-rolling an owner into a member. */
export function roleAtLeast(actor, target) {
    return ROLE_RANK[actor] >= ROLE_RANK[target];
}
/** All permissions the caller holds, factoring in the platform-staff override.
 *  Cheap; called from server components, not from render hot paths. */
export function effectivePermissions(role, isSuperAdmin) {
    if (isSuperAdmin) {
        return new Set([
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
export function roleLabel(role) {
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
export function roleDescription(role) {
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
export function assignableRoles(actor) {
    if (actor === "owner")
        return ["owner", "admin", "member"];
    if (actor === "admin")
        return ["admin", "member"];
    return [];
}
