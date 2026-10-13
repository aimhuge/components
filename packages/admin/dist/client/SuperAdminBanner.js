import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
/**
 * `<SuperAdminBanner>` — the small "you are acting as super-admin, here's who
 * you are" strip that fastmonitor renders at the top of every admin page.
 *
 * The page passes in the session-shaped user object; we don't fetch it. The
 * app's data layer already has a query for "user by id" if the page wants the
 * canonical DB record next to the session — but for the banner the session is
 * enough and it avoids a round-trip on every admin page.
 *
 * All values are optional; missing ones render as `—`. The "copy on click"
 * behavior is a small affordance that doesn't need its own cell.
 */
import { useCallback, useState } from "react";
function Copyable({ label, value, visibleChars }) {
    const [copied, setCopied] = useState(false);
    const handleClick = useCallback(() => {
        if (!value)
            return;
        if (typeof navigator === "undefined" || !navigator.clipboard)
            return;
        void navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
        });
    }, [value]);
    const display = value == null
        ? "—"
        : visibleChars != null && value.length > visibleChars
            ? value.slice(-visibleChars)
            : value;
    return (_jsxs("span", { className: "inline-flex items-center gap-1 text-xs", children: [_jsxs("strong", { className: "text-admin-muted", children: [label, ":"] }), _jsx("button", { type: "button", onClick: handleClick, disabled: !value, className: "font-mono text-admin-text hover:text-admin-accent disabled:opacity-50", title: value ?? "", children: display }), copied ? _jsx("span", { className: "text-admin-accent", children: "copied" }) : null] }));
}
export function SuperAdminBanner({ session }) {
    if (!session) {
        return (_jsx("p", { className: "text-xs text-admin-muted", children: "No session attached. The page guard should have already redirected." }));
    }
    return (_jsx("div", { role: "status", className: "flex flex-col gap-1 rounded-md border border-admin-border bg-admin-surface px-3 py-2", children: _jsxs("div", { className: "flex flex-wrap items-center gap-x-4 gap-y-1 text-xs", children: [_jsx("strong", { className: "text-admin-accent", children: "SuperAdmin" }), _jsx(Copyable, { label: "Name", value: session.name }), _jsx(Copyable, { label: "Email", value: session.email }), _jsx(Copyable, { label: "UserId", value: session.id, visibleChars: 5 }), _jsx(Copyable, { label: "TeamSlug", value: session.teamSlug }), _jsx(Copyable, { label: "TeamId", value: session.teamId, visibleChars: 5 })] }) }));
}
