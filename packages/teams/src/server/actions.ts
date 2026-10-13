/**
 * Server actions for the Team page. These are pure defaults — apps are
 * expected to either use them as-is or wrap them for app-specific
 * reconciliation (analytics, slack reports, invite ledger, etc.).
 *
 * The pattern:
 *   1. `requireOrg` to verify membership + slug.
 *   2. `roleCan` / `roleAtLeast` / `assignableRoles` to enforce permission.
 *   3. Mutate.
 *   4. `invalidateOrgAccess` so the gate cache doesn't lie.
 *   5. `revalidatePath` so the roster re-renders.
 *
 * The role/permission check is duplicated by the UI (the roster hides
 * buttons the caller can't use) — keeping the server-side check here is
 * what makes that hiding a UX nicety rather than the security boundary.
 */
"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireOrg, type TeamClients } from "./gate";
import { ORG_ROLES, type OrgRole } from "./members";
import { roleCan, roleAtLeast, assignableRoles } from "./permissions";
import { isPlausibleEmail, normalizeEmail } from "./email";
import { createInvite, revokeInvite, type InviteEmailTransport } from "./invites";

export interface ActionResult {
  ok: boolean;
  message?: string;
  /** Field name → reason, for the form to display inline. */
  fieldErrors?: Record<string, string>;
}

function fail(message: string, fieldErrors?: Record<string, string>): ActionResult {
  return { ok: false, message, fieldErrors };
}

function ok(message?: string): ActionResult {
  return { ok: true, message };
}

/** Options the app passes in once at startup. The actions read these on every
 *  call so the import is per-action, not per-render. */
export interface TeamActionsConfig {
  clients: TeamClients;
  email: InviteEmailTransport;
  appName?: string;
  assertSeatRoom?: (service: SupabaseClient, orgId: string) => Promise<void>;
  /**
   * Optional callback fired after a successful invite/membership write, for
   * app-specific side effects (analytics, slack reports, invite-ledger rows).
   * Best-effort: a throw is logged and the action still returns success.
   */
  onMembershipChanged?: (ctx: {
    kind: "added" | "removed" | "role_changed" | "invited" | "invite_revoked";
    orgId: string;
    orgSlug: string;
    userId: string | null;
    email: string | null;
    role: OrgRole;
  }) => Promise<void> | void;
}

let CONFIG: TeamActionsConfig | null = null;

/** Apps call this once at boot (e.g. in a module-init file or
 *  instrumentation hook) to register their config. After this, server
 *  actions can be called from any client component. */
export function configureTeamActions(config: TeamActionsConfig): void {
  CONFIG = config;
}

function getConfig(): TeamActionsConfig {
  if (!CONFIG) {
    throw new Error(
      "Team actions are not configured. Call configureTeamActions({...}) at startup before invoking the actions.",
    );
  }
  return CONFIG;
}

/** Invite a new member by email. If the address already has an account, we
 *  add them immediately and skip the email — without it the recipient
 *  would have to click a link to join a workspace they already had access
 *  to. */
export async function addMember(
  orgSlug: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const cfg = getConfig();
  const ctx = await requireOrg(cfg.clients, orgSlug);
  if (!roleCan(ctx.role, "members.manage") && !ctx.isSuperAdmin) {
    return fail("You don't have permission to invite members.");
  }

  const emailRaw = String(formData.get("email") ?? "");
  const roleRaw = String(formData.get("role") ?? "member");
  const role = (ORG_ROLES as readonly string[]).includes(roleRaw)
    ? (roleRaw as OrgRole)
    : "member";

  if (!isPlausibleEmail(emailRaw)) {
    return fail("Enter a valid email address.", { emailInput: "Enter a valid email address." });
  }
  if (!assignableRoles(ctx.role).includes(role) && !ctx.isSuperAdmin) {
    return fail(`You can't assign the ${role} role.`, { rolePick: "Not assignable by your role." });
  }

  const email = normalizeEmail(emailRaw);

  // Self-invite is a no-op: you're already in.
  if (ctx.email && normalizeEmail(ctx.email) === email) {
    return fail("That address is already a member of this workspace.");
  }

  // Already an active member → just acknowledge; no email, no new invite.
  const { data: existingProfile } = await ctx.service
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existingProfile) {
    const { data: existingMember } = await ctx.service
      .from("org_memberships")
      .select("user_id")
      .eq("org_id", ctx.org.id)
      .eq("user_id", existingProfile.id)
      .maybeSingle();
    if (existingMember) {
      revalidatePath(`/${orgSlug}/team`);
      return ok("That person is already on the team.");
    }

    // Has an account, not yet a member: add them now. No invite row, no
    // email. Straight in is still a seat.
    try {
      if (cfg.assertSeatRoom) await cfg.assertSeatRoom(ctx.service, ctx.org.id);
    } catch (err) {
      return fail(err instanceof Error ? err.message : "This workspace's plan has no room for another seat.");
    }
    const { error } = await ctx.service.from("org_memberships").insert({
      org_id: ctx.org.id,
      user_id: existingProfile.id,
      role,
    });
    if (error) return fail(`Could not add member: ${error.message}`);
    revalidatePath(`/${orgSlug}/team`);
    if (cfg.onMembershipChanged) {
      try {
        await cfg.onMembershipChanged({
          kind: "added",
          orgId: ctx.org.id,
          orgSlug: ctx.org.slug,
          userId: existingProfile.id as string,
          email,
          role,
        });
      } catch (err) {
        console.warn("[teams] onMembershipChanged(added) failed:", err);
      }
    }
    return ok("Added.");
  }

  // No account yet: mint a pending invite + email them.
  try {
    await createInvite({
      service: ctx.service,
      orgId: ctx.org.id,
      orgName: ctx.org.name,
      orgSlug: ctx.org.slug,
      invitedEmail: email,
      role,
      invitedBy: ctx.userId,
      inviterEmail: ctx.email,
      email: cfg.email,
      appName: cfg.appName,
      assertSeatRoom: cfg.assertSeatRoom,
    });
  } catch (err) {
    return fail(`Could not create invite: ${err instanceof Error ? err.message : "unknown"}`);
  }
  revalidatePath(`/${orgSlug}/team`);
  if (cfg.onMembershipChanged) {
    try {
      await cfg.onMembershipChanged({
        kind: "invited",
        orgId: ctx.org.id,
        orgSlug: ctx.org.slug,
        userId: null,
        email,
        role,
      });
    } catch (err) {
      console.warn("[teams] onMembershipChanged(invited) failed:", err);
    }
  }
  return ok("Invite sent.");
}

export async function changeRole(
  orgSlug: string,
  formData: FormData,
): Promise<ActionResult> {
  const cfg = getConfig();
  const ctx = await requireOrg(cfg.clients, orgSlug);
  if (!roleCan(ctx.role, "members.manage") && !ctx.isSuperAdmin) {
    return fail("You don't have permission to change roles.");
  }

  const targetUserId = String(formData.get("userId") ?? "");
  const newRoleRaw = String(formData.get("role") ?? "");
  if (!targetUserId) return fail("Missing member id.");
  if (!(ORG_ROLES as readonly string[]).includes(newRoleRaw)) return fail("Invalid role.");
  const newRole = newRoleRaw as OrgRole;

  // Refuse to demote yourself away from owner when you're the last one —
  // that would strand the workspace with no owners and is unrecoverable
  // without platform-staff intervention.
  if (targetUserId === ctx.userId && ctx.role === "owner" && newRole !== "owner") {
    return fail("You can't demote yourself out of owner. Hand the workspace to someone else first.");
  }

  // Admins cannot re-role owners (and cannot grant owner themselves).
  if (!ctx.isSuperAdmin) {
    if (!assignableRoles(ctx.role).includes(newRole)) {
      return fail(`You can't assign the ${newRole} role.`);
    }
    const { data: target } = await ctx.service
      .from("org_memberships")
      .select("role")
      .eq("org_id", ctx.org.id)
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (target && !roleAtLeast(ctx.role, target.role as OrgRole)) {
      return fail("You can't change the role of someone at or above your own.");
    }
  }

  const { error } = await ctx.service
    .from("org_memberships")
    .update({ role: newRole })
    .eq("org_id", ctx.org.id)
    .eq("user_id", targetUserId);
  if (error) return fail(`Could not change role: ${error.message}`);

  revalidatePath(`/${orgSlug}/team`);
  if (cfg.onMembershipChanged) {
    try {
      await cfg.onMembershipChanged({
        kind: "role_changed",
        orgId: ctx.org.id,
        orgSlug: ctx.org.slug,
        userId: targetUserId,
        email: null,
        role: newRole,
      });
    } catch (err) {
      console.warn("[teams] onMembershipChanged(role_changed) failed:", err);
    }
  }
  return ok("Role updated.");
}

export async function removeMember(
  orgSlug: string,
  formData: FormData,
): Promise<ActionResult> {
  const cfg = getConfig();
  const ctx = await requireOrg(cfg.clients, orgSlug);
  if (!roleCan(ctx.role, "members.manage") && !ctx.isSuperAdmin) {
    return fail("You don't have permission to remove members.");
  }

  const targetUserId = String(formData.get("userId") ?? "");
  if (!targetUserId) return fail("Missing member id.");
  if (targetUserId === ctx.userId) return fail("You can't remove yourself. Transfer ownership first.");

  if (!ctx.isSuperAdmin) {
    const { data: target } = await ctx.service
      .from("org_memberships")
      .select("role")
      .eq("org_id", ctx.org.id)
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (target && !roleAtLeast(ctx.role, target.role as OrgRole)) {
      return fail("You can't remove someone at or above your own role.");
    }
  }

  const { error } = await ctx.service
    .from("org_memberships")
    .delete()
    .eq("org_id", ctx.org.id)
    .eq("user_id", targetUserId);
  if (error) return fail(`Could not remove member: ${error.message}`);

  // Clear the active-workspace pointer if it named this org. Best-effort —
  // the membership is already gone, which is the removal itself.
  await ctx.service
    .from("profiles")
    .update({ current_org_id: null })
    .eq("id", targetUserId)
    .eq("current_org_id", ctx.org.id);

  revalidatePath(`/${orgSlug}/team`);
  if (cfg.onMembershipChanged) {
    try {
      await cfg.onMembershipChanged({
        kind: "removed",
        orgId: ctx.org.id,
        orgSlug: ctx.org.slug,
        userId: targetUserId,
        email: null,
        role: "member",
      });
    } catch (err) {
      console.warn("[teams] onMembershipChanged(removed) failed:", err);
    }
  }
  return ok("Removed.");
}

export async function revokePendingInvite(
  orgSlug: string,
  formData: FormData,
): Promise<ActionResult> {
  const cfg = getConfig();
  const ctx = await requireOrg(cfg.clients, orgSlug);
  if (!roleCan(ctx.role, "members.manage") && !ctx.isSuperAdmin) {
    return fail("You don't have permission to revoke invites.");
  }

  const inviteId = String(formData.get("inviteId") ?? "");
  if (!inviteId) return fail("Missing invite id.");

  try {
    await revokeInvite(ctx.service, inviteId);
  } catch (err) {
    return fail(`Could not revoke invite: ${err instanceof Error ? err.message : "unknown"}`);
  }
  revalidatePath(`/${orgSlug}/team`);
  if (cfg.onMembershipChanged) {
    try {
      await cfg.onMembershipChanged({
        kind: "invite_revoked",
        orgId: ctx.org.id,
        orgSlug: ctx.org.slug,
        userId: null,
        email: null,
        role: "member",
      });
    } catch (err) {
      console.warn("[teams] onMembershipChanged(invite_revoked) failed:", err);
    }
  }
  return ok("Invite revoked.");
}