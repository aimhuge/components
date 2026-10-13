/**
 * Invites: workspace email invites and their lifecycle.
 *
 * One invitation = one pending row in `public.invitations`, addressable by a
 * single-use token. The token is the capability: opening `/invite/{token}`
 * while signed in (with any address) accepts the invite and adds the claimer
 * as a member of the target org with the role the inviter picked.
 *
 * All writes go through the service client. RLS is enabled on `invitations`
 * with no policies, so a browser client can never touch this table directly
 * — every read here runs server-side.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { normalizeEmail } from "./email";
import { invalidateOrgAccess } from "./gate";
import { siteOrigin } from "./site-origin";
import type { OrgRole } from "./members";

export interface Invitation {
  id: string;
  org_id: string;
  invited_email: string;
  role: OrgRole;
  invite_token: string;
  invited_by: string | null;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  accepted_user_id: string | null;
  accepted_email: string | null;
  revoked_at: string | null;
}

export interface InviteLookup {
  invitation: Invitation;
  org: { id: string; slug: string; name: string };
}

/** 32 bytes of randomness → 43 base64url chars. Long enough that brute force
 *  is infeasible even against an old row; URL-safe so it does not need
 *  encoding. */
export function mintInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Build the claim URL we email to invitees. Server-side origin only
 *  (siteOrigin) — the email is sent from the server and a localhost recipient
 *  can't get there on their own. */
export function inviteClaimUrl(token: string): string {
  return `${siteOrigin()}/invite/${token}`;
}

/** Email body for a workspace invitation. Plain text — the recipient can pick
 *  a different sign-in address than the one we sent to, and the email has to
 *  say so, otherwise the recipient wonders why the form is prompting for a
 *  different one. */
export function inviteEmailBody(opts: {
  orgName: string;
  role: OrgRole;
  claimUrl: string;
  inviterEmail: string | null;
  appName?: string;
}): string {
  const who = opts.inviterEmail ?? "A workspace owner";
  const app = opts.appName ?? "the app";
  return [
    `${who} invited you to join "${opts.orgName}" on ${app} as a ${opts.role}.`,
    "",
    "Open the link below to accept. You can sign in with the address this",
    "email was sent to, or with a different one — both work:",
    "",
    opts.claimUrl,
    "",
    "The link expires in 14 days. If you weren't expecting this, you can",
    "safely ignore the email and nothing will be created.",
  ].join("\n");
}

/** Pluggable email transport. Apps inject their own (e.g. Resend, Postmark,
 *  SES). The package ships a no-op default that throws — apps must override.
 *  See the README "Wiring an app" for the standard contract. */
export interface InviteEmailTransport {
  send(input: { to: string; subject: string; text: string }): Promise<void>;
}

/** Create a pending invite, email the recipient, and return the row. If the
 *  email send fails the invite is still kept around — see the email
 *  transport's never-throws note. The roster surfaces "invite sent" vs.
 *  "invite pending" by checking `accepted_at IS NULL`.
 *
 *  `assertSeatRoom` is an optional hook: an app with billing can refuse
 *  before the insert. Pass `null` for "no quota check". */
export async function createInvite(input: {
  service: SupabaseClient;
  orgId: string;
  orgName: string;
  orgSlug: string;
  invitedEmail: string;
  role: OrgRole;
  invitedBy: string | null;
  inviterEmail: string | null;
  email: InviteEmailTransport;
  appName?: string;
  assertSeatRoom?: ((service: SupabaseClient, orgId: string) => Promise<void>) | null;
}): Promise<{ invitation: Invitation; alreadyPending: boolean }> {
  const email = normalizeEmail(input.invitedEmail);
  const token = mintInviteToken();
  const { data: existing } = await input.service
    .from("invitations")
    .select("*")
    .eq("org_id", input.orgId)
    .eq("invited_email", email)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    // Same address, still pending — don't mint a duplicate token (which the
    // partial-unique index would block anyway). Re-send using the existing
    // one so the recipient gets a fresh link.
    await sendInviteEmail({
      transport: input.email,
      to: email,
      orgName: input.orgName,
      appName: input.appName,
      role: existing.role as OrgRole,
      token: existing.invite_token,
      inviterEmail: input.inviterEmail,
    });
    return { invitation: existing as Invitation, alreadyPending: true };
  }

  // A pending invite holds a seat; re-sending one above doesn't add one.
  if (input.assertSeatRoom) {
    await input.assertSeatRoom(input.service, input.orgId);
  }

  const { data: inserted, error } = await input.service
    .from("invitations")
    .insert({
      org_id: input.orgId,
      invited_email: email,
      role: input.role,
      invite_token: token,
      invited_by: input.invitedBy,
    })
    .select("*")
    .single();

  if (error || !inserted) {
    throw new Error(`createInvite failed: ${error?.message ?? "no row"}`);
  }

  await sendInviteEmail({
    transport: input.email,
    to: email,
    orgName: input.orgName,
    appName: input.appName,
    role: input.role,
    token,
    inviterEmail: input.inviterEmail,
  });
  return { invitation: inserted as Invitation, alreadyPending: false };
}

async function sendInviteEmail(input: {
  transport: InviteEmailTransport;
  to: string;
  orgName: string;
  appName?: string;
  role: OrgRole;
  token: string;
  inviterEmail: string | null;
}): Promise<void> {
  const claimUrl = inviteClaimUrl(input.token);
  await input.transport.send({
    to: input.to,
    subject: `You've been invited to ${input.orgName} on ${input.appName ?? "the app"}`,
    text: inviteEmailBody({
      orgName: input.orgName,
      appName: input.appName,
      role: input.role,
      claimUrl,
      inviterEmail: input.inviterEmail,
    }),
  });
}

/** Mark a pending invite revoked. The partial-unique index frees the token
 *  so the same address can be re-invited later. Used by the "Revoke" button
 *  on the roster. */
export async function revokeInvite(
  service: SupabaseClient,
  inviteId: string,
): Promise<void> {
  const { error } = await service
    .from("invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", inviteId)
    .is("accepted_at", null);
  if (error) throw new Error(`revokeInvite failed: ${error.message}`);
}

/** Look up an invite by its token, with the org it points at. Returns null
 *  when the token doesn't resolve OR the invite has already been accepted /
 *  revoked / expired — all three look the same to the caller (and should: a
 *  used token must not reveal whether a row ever existed). */
export async function lookupInviteByToken(
  service: SupabaseClient,
  token: string,
): Promise<InviteLookup | null> {
  const { data: invite } = await service
    .from("invitations")
    .select("*")
    .eq("invite_token", token)
    .maybeSingle();
  if (!invite) return null;
  if (invite.accepted_at) return null;
  if (invite.revoked_at) return null;
  if (new Date(invite.expires_at).getTime() < Date.now()) return null;

  const { data: org } = await service
    .from("orgs")
    .select("id, slug, name")
    .eq("id", invite.org_id)
    .maybeSingle();
  if (!org) return null;

  return {
    invitation: invite as Invitation,
    org: org as { id: string; slug: string; name: string },
  };
}

/** Accept a pre-validated invite. The caller is expected to have called
 *  `lookupInviteByToken` already (the route handler uses that to decide
 *  what to render before mutating). This function is then a single
 *  membership upsert + invite stamp.
 *
 *  Idempotent: re-running with the same (token, user) is a no-op because
 *  the invite row already has `accepted_at` set, and the membership upsert
 *  collapses to the existing role.
 *
 *  Returns the workspace slug so the caller can redirect, and
 *  `alreadyMember` so it can render an appropriate success message when
 *  the recipient was already on the team (a different device / a
 *  re-clicked link). */
export async function acceptInvite(
  service: SupabaseClient,
  lookup: InviteLookup,
  acceptingUserId: string,
  acceptingUserEmail: string,
): Promise<{ orgSlug: string; alreadyMember: boolean } | null> {
  const { invitation, org } = lookup;

  const stamp = {
    accepted_at: new Date().toISOString(),
    accepted_user_id: acceptingUserId,
    accepted_email: normalizeEmail(acceptingUserEmail),
  };

  // Upsert first so a racing double-accept converges to one row.
  // `ignoreDuplicates` would lose the race; `upsert` writes the same row
  // again harmlessly.
  const { data: upserted, error: memberErr } = await service
    .from("org_memberships")
    .upsert(
      { org_id: org.id, user_id: acceptingUserId, role: invitation.role },
      { onConflict: "org_id,user_id" },
    )
    .select("user_id")
    .maybeSingle();
  if (memberErr) throw new Error(`acceptInvite membership: ${memberErr.message}`);

  const { error: stampErr } = await service
    .from("invitations")
    .update(stamp)
    .eq("id", invitation.id)
    .is("accepted_at", null);
  if (stampErr) throw new Error(`acceptInvite stamp: ${stampErr.message}`);

  invalidateOrgAccess({ orgId: org.id, userId: acceptingUserId });

  return { orgSlug: org.slug, alreadyMember: !upserted };
}

/** All currently-pending invites for an org (those are the ones the roster
 *  shows in the "Pending" column). */
export async function listPendingInvites(
  service: SupabaseClient,
  orgId: string,
): Promise<Invitation[]> {
  const { data } = await service
    .from("invitations")
    .select("*")
    .eq("org_id", orgId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  return (data ?? []) as Invitation[];
}