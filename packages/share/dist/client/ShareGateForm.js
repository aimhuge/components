"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
/** Full-screen unlock prompt for a gated share link. It POSTs `{ email }` or
 *  `{ password }` to `unlockUrl`; on success the server has set a signed pass
 *  cookie (`grantGatePass`), and the page reloads into the real view.
 *
 *  mode — "email" asks for an email; any other mode asks for the password.
 *  purpose — which door this is. The same email gate can guard the content and,
 *    on a link-edit resource, its editor; only the copy differs.
 *  knownEmail — this browser's signed-in address, or the one it last gave at any
 *    gate. Prefilled so a returning visitor just clicks through; still editable,
 *    and nothing is recorded against it until they submit.
 *  seenUrl — optional: POSTed once on mount for an email gate, so the owner sees
 *    gate drop-off, not just the people who made it through. */
export function ShareGateForm({ title, mode, unlockUrl, seenUrl, knownEmail, purpose = "view", noun = "page", onUnlocked, reload = () => window.location.reload(), }) {
    const isEmail = mode === "email";
    const [value, setValue] = useState(isEmail ? (knownEmail ?? "") : "");
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const seenSent = useRef(false);
    useEffect(() => {
        if (!isEmail || !seenUrl || seenSent.current)
            return;
        seenSent.current = true;
        fetch(seenUrl, { method: "POST" }).catch(() => { });
    }, [seenUrl, isEmail]);
    async function submit(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(unlockUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(isEmail ? { email: value } : { password: value }),
            });
            const data = (await res.json().catch(() => ({})));
            if (!res.ok) {
                setError(data.error || "Something went wrong.");
                setBusy(false);
                return;
            }
            onUnlocked?.(isEmail ? value.trim().toLowerCase() : null);
            reload();
        }
        catch {
            setError("Network error. Try again.");
            setBusy(false);
        }
    }
    return (_jsx("div", { className: "min-h-screen bg-share-stage flex items-center justify-center px-6", children: _jsxs("form", { onSubmit: submit, className: "w-full max-w-sm rounded-2xl border border-share-line bg-share-card p-8 backdrop-blur-xl", children: [_jsx("h1", { className: "text-xl font-bold text-share-ink tracking-tight", children: title }), _jsx("p", { className: "mt-2 text-sm text-share-dim leading-relaxed", children: gatePrompt({ isEmail, purpose, noun, known: Boolean(knownEmail) }) }), _jsx("input", { type: isEmail ? "email" : "password", value: value, onChange: (e) => setValue(e.target.value), 
                    // A prefilled field doesn't want the caret: the visitor's next action
                    // is the button, so don't steal focus from it.
                    autoFocus: !value, required: true, placeholder: isEmail ? "you@company.com" : "Password", "aria-label": isEmail ? "Email" : "Password", className: "mt-6 w-full rounded-lg border border-share-line bg-share-field px-4 py-3 text-sm text-share-ink placeholder:text-share-faint outline-none focus:border-accent" }), error && _jsx("p", { className: "mt-3 text-xs text-share-danger", role: "alert", children: error }), _jsx("button", { type: "submit", disabled: busy, className: "mt-5 w-full rounded-lg bg-accent py-3 text-sm font-semibold text-share-on-accent transition-opacity hover:opacity-90 disabled:opacity-50", children: busy ? "Checking…" : !isEmail ? "Unlock" : purpose === "edit" ? "Start editing" : `View ${noun}` })] }) }));
}
function gatePrompt({ isEmail, purpose, noun, known }) {
    if (!isEmail)
        return `This ${noun} is password-protected. Enter the password to continue.`;
    if (purpose === "edit") {
        return known
            ? `Confirm your email to edit this ${noun} — your name shows up next to your changes.`
            : `This ${noun} is open for editing. Enter your email so your changes have a name on them.`;
    }
    return known ? `Confirm your email to view this ${noun}.` : `Enter your email to view this ${noun}.`;
}
