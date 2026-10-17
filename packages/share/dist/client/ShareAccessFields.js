"use client";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Check, Eye, Loader2, Pencil } from "lucide-react";
import { AUDIENCE_LABEL, AUDIENCE_OPTIONS, LEVEL_LABEL, LEVEL_OPTIONS, consequenceOf, gateLabels, gateOptionsFor, } from "../axes.js";
import { AUDIENCE_ICON, GATE_ICON } from "./icons.js";
/** "General access": the resource-wide share mode, asked as the three questions
 *  it actually is instead of one fused enum:
 *
 *    Who can open it   →  private / anyone with the link
 *    What they can do  →  view / view and edit     (hidden when allowEdit is false)
 *    Asked for first   →  nothing / an email / a password   (link only)
 *
 *  A single select made people decode combinations ("Anyone with the link can
 *  edit": gated or not?). The axes module owns the mapping back to the mode and
 *  refuses to emit a combination the schema can't hold.
 *
 *  `children` render under the consequence line: the app's own access toggles
 *  (DeckCP's comment settings). */
export function ShareAccessFields({ s, noun = "page", allowEdit = true, editLimits, children, }) {
    const axes = s.axes;
    const loading = axes === null;
    const shared = axes?.audience === "link";
    const AudienceIcon = AUDIENCE_ICON[axes?.audience ?? "private"];
    const GateIcon = GATE_ICON[axes?.gate ?? "none"];
    const gateLabel = gateLabels(noun);
    return (_jsxs("div", { className: "mt-4 pt-4 border-t border-share-line", children: [_jsxs("div", { className: "flex items-center justify-between gap-2 mb-1.5", children: [_jsx("p", { className: "text-[11px] font-mono uppercase tracking-widest text-share-muted", children: "General access" }), s.saving ? (_jsx(Loader2, { className: "w-3.5 h-3.5 shrink-0 animate-spin text-share-muted", "aria-label": "Saving" })) : s.saved ? (_jsx(Check, { className: "w-3.5 h-3.5 shrink-0 text-share-ok", "aria-label": "Saved" })) : null] }), _jsx(AxisRow, { label: "Who", icon: AudienceIcon, active: shared, children: _jsx("select", { value: axes?.audience ?? "private", onChange: (e) => s.saveAxis({ audience: e.target.value }), disabled: s.saving || loading, "aria-label": `Who can open this ${noun}`, className: SELECT_CLASS, children: AUDIENCE_OPTIONS.map((a) => (_jsx("option", { value: a, children: AUDIENCE_LABEL[a] }, a))) }) }), shared && axes && (_jsxs(_Fragment, { children: [allowEdit && (_jsx(AxisRow, { label: "Access level", icon: axes.level === "edit" ? Pencil : Eye, active: true, children: _jsx("select", { value: axes.level, onChange: (e) => s.saveAxis({ level: e.target.value }), disabled: s.saving, "aria-label": "What link holders can do", className: SELECT_CLASS, children: LEVEL_OPTIONS.map((l) => (_jsx("option", { value: l, children: LEVEL_LABEL[l] }, l))) }) })), _jsx(AxisRow, { label: "Ask them for", icon: GateIcon, active: axes.gate !== "none", children: _jsx("select", { value: axes.gate, onChange: (e) => s.saveAxis({ gate: e.target.value }), disabled: s.saving, "aria-label": `What visitors hand over before the ${noun} opens`, className: SELECT_CLASS, children: gateOptionsFor(axes.level).map((g) => (_jsx("option", { value: g, children: gateLabel[g] }, g))) }) })] })), axes?.gate === "password" && (_jsxs("div", { className: "mt-2 flex items-center gap-1.5 pl-[104px]", children: [_jsx("input", { type: "text", value: s.password, onChange: (e) => s.setPassword(e.target.value), placeholder: s.hasPassword ? "Change password…" : "Set a password", "aria-label": "Share password", className: "min-w-0 flex-1 rounded-lg border border-share-line bg-share-field px-3 py-1.5 text-sm text-share-ink placeholder:text-share-faint outline-none focus:border-accent" }), _jsx("button", { type: "button", onClick: () => s.savePassword(), disabled: s.saving || (!s.password && !s.hasPassword), className: "shrink-0 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-share-on-accent disabled:opacity-40", children: "Save" })] })), axes && (_jsx("p", { className: `mt-2 px-0.5 text-[11px] leading-relaxed ${axes.level === "edit" ? "text-share-warn" : "text-share-muted"}`, children: consequenceOf(axes, noun, editLimits) })), children && _jsx("div", { className: "mt-2", children: children }), s.error && _jsx("p", { className: "text-xs text-share-danger mt-2", role: "alert", children: s.error })] }));
}
const SELECT_CLASS = "min-w-0 flex-1 rounded-lg border border-share-line bg-share-field px-2 py-1.5 text-sm text-share-ink outline-none focus:border-accent disabled:opacity-40";
/** One labelled axis. The fixed-width label column is what separates the
 *  questions visually: without it, stacked selects read as a list of
 *  alternatives rather than independent settings. */
function AxisRow({ label, icon: Icon, active, children, }) {
    return (_jsxs("div", { className: "mt-1.5 flex items-center gap-2", children: [_jsx("span", { className: "w-[72px] shrink-0 text-right text-[11px] text-share-muted", children: label }), _jsx(Icon, { className: `w-4 h-4 shrink-0 ${active ? "text-accent" : "text-share-muted"}` }), children] }));
}
