"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import Link from "next/link.js";
import { ArrowRight, Loader2, LogOut } from "lucide-react";
import { signOutAndRedirect } from "../server/actions.js";
/**
 * The "you're already signed in as …" banner, shown above the sign-in form
 * when a returning visitor lands on /login with a live session. They can go
 * straight on to `next`, or sign out and use another account, instead of
 * staring at a form they don't need.
 *
 * Two rows: the identity (full card width, so a long name isn't cut to
 * "Alex …" on a phone), then Continue (primary, takes the rest of the row) and
 * Switch account (content-sized). The macOS / GitHub / Linear pattern.
 */
export function SignedInPrompt({ identity, next }) {
    const [switching, setSwitching] = useState(false);
    const { name, email, avatarUrl } = identity;
    const display = name ?? email ?? "Signed in";
    const initial = (name?.[0] ?? email?.[0] ?? "?").toUpperCase();
    return (_jsxs("div", { className: "mb-6 rounded-md border border-accent/30 bg-auth-panel px-4 py-3.5", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsxs("span", { "aria-hidden": "true", className: "flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent/20 text-[14px] font-semibold text-accent", children: [avatarUrl ? (
                            // Plain <img>, not next/image: an app's image allowlist rarely
                            // includes lh3.googleusercontent.com. no-referrer because some
                            // Google avatars 403 when the referring origin isn't one the user
                            // authorised.
                            // eslint-disable-next-line @next/next/no-img-element
                            _jsx("img", { src: avatarUrl, alt: "", width: 40, height: 40, loading: "lazy", referrerPolicy: "no-referrer", className: "h-full w-full object-cover", onError: (e) => {
                                    // Swap to the initial if the URL 404s or is blocked: the
                                    // fallback is the next sibling.
                                    const target = e.currentTarget;
                                    target.style.display = "none";
                                    const fallback = target.nextElementSibling;
                                    if (fallback)
                                        fallback.style.display = "";
                                } })) : null, _jsx("span", { style: { display: avatarUrl ? "none" : "" }, children: initial })] }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "truncate text-sm font-semibold text-auth-ink", children: display }), _jsx("p", { className: "whitespace-nowrap font-mono text-[10px] tracking-[0.18em] uppercase text-auth-muted", children: "Already signed in" })] })] }), _jsxs("div", { className: "mt-3 flex items-center gap-2", children: [_jsxs(Link, { href: next, className: "flex flex-1 items-center justify-center gap-1.5 rounded-md bg-accent hover:bg-accent-hover text-accent-ink px-4 py-2 text-sm font-semibold transition duration-150", children: ["Continue", _jsx(ArrowRight, { className: "h-4 w-4", "aria-hidden": "true" })] }), _jsx("form", { action: signOutAndRedirect.bind(null, next), onSubmit: () => setSwitching(true), children: _jsxs("button", { type: "submit", disabled: switching, title: "Sign out and show the sign-in form", className: "flex items-center gap-1.5 rounded-md border border-auth-ink/15 px-3.5 py-2 text-sm font-semibold text-auth-muted hover:border-auth-ink/40 hover:text-auth-ink transition duration-150 disabled:opacity-50", children: [switching ? (_jsx(Loader2, { className: "h-4 w-4 animate-spin", "aria-label": "Signing out" })) : (_jsx(LogOut, { className: "h-4 w-4", "aria-hidden": "true" })), "Switch account"] }) })] })] }));
}
