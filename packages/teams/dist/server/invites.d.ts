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
    org: {
        id: string;
        slug: string;
        name: string;
    };
}
/** 32 bytes of randomness → 43 base64url chars. Long enough that brute force
 *  is infeasible even against an old row; URL-safe so it does not need
 *  encoding. */
export declare function mintInviteToken(): string;
/** Build the claim URL we email to invitees. Server-side origin only
 *  (siteOrigin) — the email is sent from the server and a localhost recipient
 *  can't get there on their own. */
export declare function inviteClaimUrl(token: string): string;
/** Email body for a workspace invitation. Plain text — the recipient can pick
 *  a different sign-in address than the one we sent to, and the email has to
 *  say so, otherwise the recipient wonders why the form is prompting for a
 *  different one. */
export declare function inviteEmailBody(opts: {
    orgName: string;
    role: OrgRole;
    claimUrl: string;
    inviterEmail: string | null;
    appName?: string;
}): string;
/** Pluggable email transport. Apps inject their own (e.g. Resend, Postmark,
 *  SES). The package ships a no-op default that throws — apps must override.
 *  See the README "Wiring an app" for the standard contract. */
export interface InviteEmailTransport {
    send(input: {
        to: string;
        subject: string;
        text: string;
    }): Promise<void>;
}
/** Create a pending invite, email the recipient, and return the row. If the
 *  email send fails the invite is still kept around — see the email
 *  transport's never-throws note. The roster surfaces "invite sent" vs.
 *  "invite pending" by checking `accepted_at IS NULL`.
 *
 *  `assertSeatRoom` is an optional hook: an app with billing can refuse
 *  before the insert. Pass `null` for "no quota check". */
export declare function createInvite(input: {
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
}): Promise<{
    invitation: Invitation;
    alreadyPending: boolean;
}>;
/** Mark a pending invite revoked. The partial-unique index frees the token
 *  so the same address can be re-invited later. Used by the "Revoke" button
 *  on the roster. */
export declare function revokeInvite(service: SupabaseClient, inviteId: string): Promise<void>;
/** Look up an invite by its token, with the org it points at. Returns null
 *  when the token doesn't resolve OR the invite has already been accepted /
 *  revoked / expired — all three look the same to the caller (and should: a
 *  used token must not reveal whether a row ever existed). */
export declare function lookupInviteByToken(service: SupabaseClient, token: string): Promise<InviteLookup | null>;
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
export declare function acceptInvite(service: SupabaseClient, lookup: InviteLookup, acceptingUserId: string, acceptingUserEmail: string): Promise<{
    orgSlug: string;
    alreadyMember: boolean;
} | null>;
/** All currently-pending invites for an org (those are the ones the roster
 *  shows in the "Pending" column). */
export declare function listPendingInvites(service: SupabaseClient, orgId: string): Promise<Invitation[]>;
