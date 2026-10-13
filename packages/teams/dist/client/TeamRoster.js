"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useTransition } from "react";
import { changeRole, removeMember } from "../server/actions.js";
import { assignableRoles, roleLabel } from "../server/permissions.js";
import { ORG_ROLES } from "../server/members.js";
const defaultRenderEmail = ({ email, className }) => (_jsx("span", { className: className, children: email }));
/** The members table: one row per member with role select + remove button.
 *
 *  Permission gating: `canManage` from the parent decides whether the
 *  controls render at all. The server action re-checks — that's the actual
 *  boundary — so a stale render with a stale permission can't do harm. */
export function TeamRoster({ orgSlug, currentUserId, members, actorRole, canManage, renderEmail = defaultRenderEmail, }) {
    if (members.length === 0) {
        return (_jsx("p", { className: "mt-3 rounded-xl border border-card-border p-6 text-sm text-muted", children: "No members yet." }));
    }
    return (_jsx("ul", { className: "mt-3 divide-y divide-card-border rounded-xl border border-card-border", children: members.map((m) => (_jsx(MemberRow, { orgSlug: orgSlug, currentUserId: currentUserId, member: m, actorRole: actorRole, canManage: canManage, renderEmail: renderEmail }, m.user_id))) }));
}
function MemberRow({ orgSlug, currentUserId, member, actorRole, canManage, renderEmail, }) {
    const isSelf = member.user_id === currentUserId;
    const label = member.display_name ||
        (member.email ? member.email.split("@")[0] : null) ||
        "Member";
    return (_jsxs("li", { className: "flex items-center justify-between gap-4 px-4 py-3", children: [_jsxs("div", { className: "min-w-0", children: [_jsxs("p", { className: "truncate text-sm font-medium text-foreground", children: [label, isSelf && _jsx("span", { className: "ml-2 text-xs text-muted", children: "(you)" })] }), member.email ? (_jsx("p", { className: "truncate text-xs text-muted", children: renderEmail({ email: member.email, className: "text-muted hover:text-foreground" }) })) : null] }), canManage ? (_jsx(MemberControls, { orgSlug: orgSlug, member: member, actorRole: actorRole, isSelf: isSelf })) : (_jsx("span", { className: "rounded-full border border-card-border px-2.5 py-0.5 text-xs font-medium text-muted", children: roleLabel(member.role) }))] }));
}
function MemberControls({ orgSlug, member, actorRole, isSelf, }) {
    const allowed = new Set(assignableRoles(actorRole));
    const [pending, start] = useTransition();
    const submitChangeRole = (fd) => {
        fd.set("userId", member.user_id);
        start(() => {
            void changeRole(orgSlug, fd);
        });
    };
    const submitRemove = (fd) => {
        fd.set("userId", member.user_id);
        start(() => {
            void removeMember(orgSlug, fd);
        });
    };
    return (_jsxs("div", { className: "flex shrink-0 items-center gap-2", children: [_jsx("form", { action: submitChangeRole, children: _jsx("select", { name: "role", defaultValue: member.role, onChange: (e) => e.currentTarget.form?.requestSubmit(), disabled: pending, className: "rounded-lg border border-card-border bg-background px-2 py-1 text-xs font-medium text-foreground disabled:opacity-50", "aria-label": `Role for ${member.email ?? member.display_name ?? "member"}`, children: ORG_ROLES.map((r) => (_jsx("option", { value: r, disabled: !allowed.has(r), children: roleLabel(r) }, r))) }) }), !isSelf && (_jsx("form", { action: submitRemove, children: _jsx("button", { type: "submit", disabled: pending, className: "rounded-lg border border-card-border px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-red-400 hover:text-red-400 disabled:opacity-50", children: "Remove" }) }))] }));
}
