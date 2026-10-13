"use client";

import { useTransition } from "react";
import { changeRole, removeMember, type ActionResult } from "../server/actions.js";
import { assignableRoles, roleLabel } from "../server/permissions.js";
import { ORG_ROLES, type OrgRole, type OrgMember } from "../server/members.js";

/** Display a member's email. Apps that already have an EmailLink component
 *  can pass it in via `renderEmail`; otherwise we render a bare text node,
 *  which a linkifier browser extension may wrap after hydration. */
type EmailRenderer = (props: { email: string; className?: string }) => React.ReactNode;

const defaultRenderEmail: EmailRenderer = ({ email, className }) => (
  <span className={className}>{email}</span>
);

/** The members table: one row per member with role select + remove button.
 *
 *  Permission gating: `canManage` from the parent decides whether the
 *  controls render at all. The server action re-checks — that's the actual
 *  boundary — so a stale render with a stale permission can't do harm. */
export function TeamRoster({
  orgSlug,
  currentUserId,
  members,
  actorRole,
  canManage,
  renderEmail = defaultRenderEmail,
}: {
  orgSlug: string;
  currentUserId: string;
  members: OrgMember[];
  actorRole: OrgRole;
  canManage: boolean;
  renderEmail?: EmailRenderer;
}) {
  if (members.length === 0) {
    return (
      <p className="mt-3 rounded-xl border border-card-border p-6 text-sm text-muted">
        No members yet.
      </p>
    );
  }

  return (
    <ul className="mt-3 divide-y divide-card-border rounded-xl border border-card-border">
      {members.map((m) => (
        <MemberRow
          key={m.user_id}
          orgSlug={orgSlug}
          currentUserId={currentUserId}
          member={m}
          actorRole={actorRole}
          canManage={canManage}
          renderEmail={renderEmail}
        />
      ))}
    </ul>
  );
}

function MemberRow({
  orgSlug,
  currentUserId,
  member,
  actorRole,
  canManage,
  renderEmail,
}: {
  orgSlug: string;
  currentUserId: string;
  member: OrgMember;
  actorRole: OrgRole;
  canManage: boolean;
  renderEmail: EmailRenderer;
}) {
  const isSelf = member.user_id === currentUserId;
  const label =
    member.display_name ||
    (member.email ? member.email.split("@")[0] : null) ||
    "Member";

  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          {label}
          {isSelf && <span className="ml-2 text-xs text-muted">(you)</span>}
        </p>
        {member.email ? (
          <p className="truncate text-xs text-muted">
            {renderEmail({ email: member.email, className: "text-muted hover:text-foreground" })}
          </p>
        ) : null}
      </div>

      {canManage ? (
        <MemberControls orgSlug={orgSlug} member={member} actorRole={actorRole} isSelf={isSelf} />
      ) : (
        <span className="rounded-full border border-card-border px-2.5 py-0.5 text-xs font-medium text-muted">
          {roleLabel(member.role)}
        </span>
      )}
    </li>
  );
}

function MemberControls({
  orgSlug,
  member,
  actorRole,
  isSelf,
}: {
  orgSlug: string;
  member: OrgMember;
  actorRole: OrgRole;
  isSelf: boolean;
}) {
  const allowed = new Set<OrgRole>(assignableRoles(actorRole));
  const [pending, start] = useTransition();

  const submitChangeRole = (fd: FormData) => {
    fd.set("userId", member.user_id);
    start(() => {
      void changeRole(orgSlug, fd);
    });
  };

  const submitRemove = (fd: FormData) => {
    fd.set("userId", member.user_id);
    start(() => {
      void removeMember(orgSlug, fd);
    });
  };

  return (
    <div className="flex shrink-0 items-center gap-2">
      <form action={submitChangeRole}>
        <select
          name="role"
          defaultValue={member.role}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          disabled={pending}
          className="rounded-lg border border-card-border bg-background px-2 py-1 text-xs font-medium text-foreground disabled:opacity-50"
          aria-label={`Role for ${member.email ?? member.display_name ?? "member"}`}
        >
          {ORG_ROLES.map((r) => (
            <option key={r} value={r} disabled={!allowed.has(r)}>
              {roleLabel(r)}
            </option>
          ))}
        </select>
      </form>

      {!isSelf && (
        <form action={submitRemove}>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg border border-card-border px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-red-400 hover:text-red-400 disabled:opacity-50"
          >
            Remove
          </button>
        </form>
      )}
    </div>
  );
}