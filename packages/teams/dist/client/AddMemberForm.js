"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useActionState, useState } from "react";
import { addMember } from "../server/actions.js";
import { assignableRoles, roleDescription, roleLabel } from "../server/permissions.js";
const initial = { ok: true };
/** Form to invite a new member by email. UX: errors from the server come
 *  back via useActionState; the form is sticky on partial failure. The
 *  role select has a live description of what each role can do so the
 *  inviter doesn't have to guess.
 *
 *  Styled with neutral Tailwind classes; apps can wrap this in their own
 *  branded chrome or import it as-is. */
export function AddMemberForm({ orgSlug, actorRole, isSuperAdmin, }) {
    // Super-admins get every role; everyone else is clipped by
    // assignableRoles.
    const options = isSuperAdmin
        ? ["admin", "member", "owner"]
        : assignableRoles(actorRole);
    // Always default to "member" — picking the last option in the array
    // would default to "owner" for super-admins, which is
    // privileged-by-default and a footgun. Make granting elevated roles an
    // explicit choice.
    const defaultRole = "member";
    const [picked, setPicked] = useState(defaultRole);
    const bound = async (_prev, formData) => {
        return addMember(orgSlug, _prev, formData);
    };
    const [state, formAction, pending] = useActionState(bound, initial);
    return (_jsxs("form", { action: formAction, className: "flex flex-col gap-2", children: [_jsxs("div", { className: "flex flex-wrap items-start gap-2", children: [_jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("input", { type: "email", name: "email", required: true, placeholder: "email@example.com", "aria-label": "Email address", className: "w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm placeholder:text-muted" }), state.fieldErrors?.emailInput && (_jsx("p", { className: "mt-1 text-xs text-red-400", children: state.fieldErrors.emailInput }))] }), _jsx("select", { name: "role", value: picked, onChange: (e) => setPicked(e.currentTarget.value), className: "rounded-lg border border-card-border bg-background px-3 py-2 text-sm", "aria-label": "Role", children: options.map((r) => (_jsx("option", { value: r, children: roleLabel(r) }, r))) }), _jsx("button", { type: "submit", disabled: pending, className: "rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50", children: pending ? "Sending…" : "Send invite" })] }), _jsxs("p", { className: "text-xs text-muted", "aria-live": "polite", children: [_jsxs("span", { className: "font-medium text-foreground", children: [roleLabel(picked), ":"] }), " ", roleDescription(picked)] }), state.message && !state.ok && !state.fieldErrors && (_jsx("p", { className: "text-xs text-red-400", children: state.message })), state.message && state.ok && (_jsx("p", { className: "text-xs text-emerald-400", children: state.message }))] }));
}
