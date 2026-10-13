"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useTransition } from "react";
import { revokePendingInvite } from "../server/actions.js";
import { roleLabel } from "../server/permissions.js";
const defaultRenderEmail = ({ email, className }) => (_jsx("span", { className: className, children: email }));
/** List of pending invitations with a Revoke action per row. The token
 *  itself never leaves this client island — a recipient's inbox is the
 *  only place the secret copy lives. */
export function PendingInviteList({ orgSlug, invites, canManage, renderEmail = defaultRenderEmail, formatExpiry, }) {
    return (_jsx("ul", { className: "mt-3 divide-y divide-card-border rounded-xl border border-card-border", children: invites.map((invite) => (_jsx(PendingInviteRow, { orgSlug: orgSlug, invite: invite, canManage: canManage, renderEmail: renderEmail, formatExpiry: formatExpiry }, invite.id))) }));
}
function PendingInviteRow({ orgSlug, invite, canManage, renderEmail, formatExpiry, }) {
    const [pending, start] = useTransition();
    const submitRevoke = (fd) => {
        fd.set("inviteId", invite.id);
        start(() => {
            void revokePendingInvite(orgSlug, fd);
        });
    };
    const expiry = formatExpiry
        ? formatExpiry(invite.expires_at)
        : new Date(invite.expires_at).toLocaleDateString();
    return (_jsxs("li", { className: "flex items-center justify-between gap-4 px-4 py-3", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "truncate text-sm font-medium text-foreground", children: renderEmail({ email: invite.invited_email, className: "text-foreground" }) }), _jsxs("p", { className: "text-xs text-muted", children: ["Invited as ", roleLabel(invite.role), " \u2022 ", expiry, " expiry"] })] }), canManage && (_jsx("form", { action: submitRevoke, children: _jsx("button", { type: "submit", disabled: pending, className: "rounded-lg border border-card-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-red-400 hover:text-red-400 disabled:opacity-50", children: "Revoke" }) }))] }));
}
