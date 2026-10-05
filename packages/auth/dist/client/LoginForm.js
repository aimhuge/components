"use client";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { ArrowRight, Loader2, MailCheck } from "lucide-react";
import { GoogleG } from "./GoogleG.js";
import { useLoginFlow } from "./useLoginFlow.js";
/**
 * "Continue with Google" plus a magic-link email field. No passwords.
 *
 * The default look for `useLoginFlow`, which owns every behaviour (guest
 * upgrade, the desktop-shell round trip, the `signin=force` loop guard). An
 * app that wants a different form calls the hook and draws its own.
 *
 * Must render inside a <Suspense> boundary. Colours come from the `auth-*`
 * tokens in auth.css.
 */
export function LoginForm(props) {
    const { busy, error, sentTo, awaitingBrowser, signInWithGoogle, sendMagicLink, reset } = useLoginFlow(props);
    const [email, setEmail] = useState("");
    const onSubmit = (e) => {
        e.preventDefault();
        void sendMagicLink(email);
    };
    if (sentTo) {
        return (_jsxs("div", { className: "flex flex-col items-center text-center py-2 animate-auth-scale-in", children: [_jsx(MailCheck, { className: "w-10 h-10 text-accent mb-3", "aria-hidden": "true" }), _jsx("h2", { className: "font-display text-xl font-bold text-auth-ink", children: "Check your inbox." }), _jsxs("p", { className: "mt-1.5 text-sm text-auth-muted max-w-[36ch]", children: ["A sign-in link is on its way to ", _jsx("span", { className: "font-semibold text-auth-ink", children: sentTo }), ". Open it on this device."] }), _jsx("button", { type: "button", onClick: reset, className: "mt-5 font-mono text-[11px] text-auth-muted underline underline-offset-4 hover:text-auth-ink", children: "use a different email" })] }));
    }
    if (awaitingBrowser) {
        return (_jsxs("div", { className: "flex flex-col items-center text-center py-2 animate-auth-scale-in", children: [_jsx(Loader2, { className: "w-10 h-10 text-accent mb-3 animate-spin", "aria-hidden": "true" }), _jsx("h2", { className: "font-display text-xl font-bold text-auth-ink", children: "Finish signing in in your browser." }), _jsx("p", { className: "mt-1.5 text-sm text-auth-muted max-w-[36ch]", children: "We opened your default browser to continue with Google. Come back to this window once you're done \u2014 it'll pick up from there." }), _jsx("button", { type: "button", onClick: reset, className: "mt-5 font-mono text-[11px] text-auth-muted underline underline-offset-4 hover:text-auth-ink", children: "try again" })] }));
    }
    return (_jsxs("div", { className: "w-full", children: [_jsx("button", { type: "button", onClick: () => void signInWithGoogle(), disabled: busy !== null, "aria-busy": busy === "google", className: "w-full flex items-center justify-center gap-2.5 border-[1.5px] border-auth-field-ink/15 hover:border-auth-field-ink/40 bg-auth-field text-auth-field-ink rounded-md px-4 py-2.5 text-sm font-semibold transition duration-150 disabled:opacity-50", children: busy === "google" ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "w-4.5 h-4.5 animate-spin", "aria-hidden": "true" }), "Redirecting to Google\u2026"] })) : (_jsxs(_Fragment, { children: [_jsx(GoogleG, { className: "w-4.5 h-4.5" }), "Continue with Google"] })) }), _jsxs("div", { className: "flex items-center gap-3 my-5", "aria-hidden": "true", children: [_jsx("span", { className: "flex-1 border-t border-auth-ink/10" }), _jsx("span", { className: "font-mono text-[10px] tracking-[0.18em] uppercase text-auth-muted", children: "or" }), _jsx("span", { className: "flex-1 border-t border-auth-ink/10" })] }), _jsxs("form", { onSubmit: onSubmit, children: [_jsx("label", { htmlFor: "login-email", className: "block font-mono text-[11px] text-auth-muted mb-1.5", children: "email \u2014 we'll send a magic link, no password" }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("input", { id: "login-email", type: "email", value: email, onChange: (e) => setEmail(e.target.value), placeholder: "you@company.com", required: true, disabled: busy !== null, className: "flex-1 min-w-0 bg-auth-field border-[1.5px] border-auth-field-ink/15 rounded-md px-3.5 py-2.5 text-sm text-auth-field-ink placeholder:text-auth-field-ink/40 focus:outline-none focus:border-accent transition duration-150 disabled:opacity-50" }), _jsx("button", { type: "submit", disabled: busy !== null || !email, className: "flex items-center justify-center bg-accent hover:bg-accent-hover text-accent-ink rounded-md px-4 py-2.5 text-sm font-semibold transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed group/btn whitespace-nowrap", children: busy === "email" ? (_jsx(Loader2, { className: "w-4 h-4 animate-spin", "aria-label": "Sending" })) : (_jsxs(_Fragment, { children: ["Send link", _jsx(ArrowRight, { className: "w-4 h-4 ml-1.5 transform group-hover/btn:translate-x-0.5 transition-transform", "aria-hidden": "true" })] })) })] })] }), error && (_jsx("p", { className: "mt-3 text-xs text-rose-600 animate-auth-fade-in", role: "alert", children: error }))] }));
}
