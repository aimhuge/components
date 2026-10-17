"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Loader2 } from "lucide-react";
/** On/off row for a share setting. Keeps its sub-caption: a bare "Allow
 *  anonymous posts / Off" makes the reader guess what Off actually does. */
export function ToggleRow({ icon: RowIcon, label, sub, on, disabled, busy, indent, onClick, }) {
    return (_jsxs("button", { type: "button", onClick: onClick, disabled: disabled || busy, "aria-pressed": on && !disabled, className: `w-full flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors ${indent ? "pl-8" : ""} ${disabled ? "cursor-not-allowed text-share-faint" : "text-share-soft hover:bg-share-hover"}`, children: [RowIcon && _jsx(RowIcon, { className: "w-4 h-4 shrink-0 mt-0.5" }), _jsxs("span", { className: "flex-1 text-left", children: [label, sub && _jsx("span", { className: "mt-0.5 block text-[11px] text-share-muted", children: sub })] }), busy ? (_jsx(Loader2, { className: "w-3.5 h-3.5 shrink-0 mt-0.5 animate-spin text-share-muted" })) : (_jsx("span", { className: `shrink-0 text-xs ${on && !disabled ? "text-accent" : "text-share-muted"}`, children: on && !disabled ? "On" : "Off" }))] }));
}
