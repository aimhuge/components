"use client";

import { useTransition, type ReactNode } from "react";
import { revokePendingInvite, type ActionResult } from "../server/actions.js";
import { roleLabel } from "../server/permissions.js";
import type { Invitation } from "../server/invites.js";

type EmailRenderer = (props: { email: string; className?: string }) => ReactNode;

const defaultRenderEmail: EmailRenderer = ({ email, className }) => (
  <span className={className}>{email}</span>
);

/** List of pending invitations with a Revoke action per row. The token
 *  itself never leaves this client island — a recipient's inbox is the
 *  only place the secret copy lives. */
export function PendingInviteList({
  orgSlug,
  invites,
  canManage,
  renderEmail = defaultRenderEmail,
  formatExpiry,
}: {
  orgSlug: string;
  invites: Invitation[];
  canManage: boolean;
  renderEmail?: EmailRenderer;
  /** Optional pretty-printer for the expiry date — apps typically have a
   *  shared `formatAbsoluteShort` in their format helpers. */
  formatExpiry?: (iso: string) => string;
}) {
  return (
    <ul className="mt-3 divide-y divide-card-border rounded-xl border border-card-border">
      {invites.map((invite) => (
        <PendingInviteRow
          key={invite.id}
          orgSlug={orgSlug}
          invite={invite}
          canManage={canManage}
          renderEmail={renderEmail}
          formatExpiry={formatExpiry}
        />
      ))}
    </ul>
  );
}

function PendingInviteRow({
  orgSlug,
  invite,
  canManage,
  renderEmail,
  formatExpiry,
}: {
  orgSlug: string;
  invite: Invitation;
  canManage: boolean;
  renderEmail: EmailRenderer;
  formatExpiry?: (iso: string) => string;
}) {
  const [pending, start] = useTransition();

  const submitRevoke = (fd: FormData) => {
    fd.set("inviteId", invite.id);
    start(() => {
      void revokePendingInvite(orgSlug, fd);
    });
  };

  const expiry = formatExpiry
    ? formatExpiry(invite.expires_at)
    : new Date(invite.expires_at).toLocaleDateString();

  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          {renderEmail({ email: invite.invited_email, className: "text-foreground" })}
        </p>
        <p className="text-xs text-muted">
          Invited as {roleLabel(invite.role)} • {expiry} expiry
        </p>
      </div>
      {canManage && (
        <form action={submitRevoke}>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg border border-card-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-red-400 hover:text-red-400 disabled:opacity-50"
          >
            Revoke
          </button>
        </form>
      )}
    </li>
  );
}