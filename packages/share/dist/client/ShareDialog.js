"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from "react";
import { X } from "lucide-react";
/** The Share dialog's frame, Google-Docs style: a title with a quick Copy link
 *  beside it, the app's sections in the middle (people, general access, a link
 *  preview), and a footer with the link buttons and Done.
 *
 *  Mount it only while open. Escape, the backdrop and the X all call onClose,
 *  once each, so the app's close (which may save on the way out) runs once. */
export function ShareDialog({ title, onClose, headerAction, footerStart, doneLabel = "Done", children, }) {
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "Escape")
                onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);
    return (_jsxs("div", { className: "fixed inset-0 z-[100] flex items-center justify-center p-4", children: [_jsx("div", { className: "absolute inset-0 bg-share-scrim", onClick: onClose, "aria-hidden": "true", "data-testid": "share-backdrop" }), _jsxs("div", { role: "dialog", "aria-modal": "true", "aria-label": title, className: "relative w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-2xl border border-share-line bg-share-surface p-5 shadow-2xl", children: [_jsxs("div", { className: "flex items-start justify-between gap-3 mb-4", children: [_jsx("h2", { className: "min-w-0 flex-1 text-base font-medium text-share-ink truncate", children: title }), headerAction, _jsx("button", { type: "button", onClick: onClose, className: "p-1 -m-1 text-share-muted hover:text-share-ink", title: "Close", "aria-label": "Close", children: _jsx(X, { className: "w-4 h-4" }) })] }), children, _jsxs("div", { className: "mt-5 flex items-center justify-between gap-2", children: [_jsx("div", { className: "flex min-w-0 items-center gap-2", children: footerStart }), _jsx("button", { type: "button", onClick: onClose, className: "shrink-0 rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-share-on-accent", children: doneLabel })] })] })] }));
}
