"use client";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// A column's menu in a sheet (@aimhuge/sheet), opened by a click on its header and typed
// into straight away. The search column's box filters the rows as you type. Every other column's box narrows its
// values: ↑↓ move, Enter keeps only the one you're on (or every value you've matched), and each value has an Only
// button. The sort sits at the foot as two buttons rather than menu rows, so one click picks a direction.
import { useState } from "react";
import { BLANK } from "../sheet.js";
import { stepHighlight, typeahead } from "../typeahead.js";
import { SheetPopover, PopSearch } from "./SheetPopover.js";
export function SheetFilterMenu(props) {
    const { label, anchor, onClose, search } = props;
    return (_jsxs(SheetPopover, { anchor: anchor, label: `${label} column`, width: search ? 300 : 264, onClose: onClose, children: [search ? _jsx(SearchBox, { ...props, search: search }) : _jsx(ValueFilter, { ...props }), _jsx(SortBar, { column: props.column, sort: props.sort, names: props.sortNames, onSort: props.onSort })] }));
}
function SearchBox({ query, matching, onQuery, onClose, search }) {
    const [one, many] = search.noun;
    return (_jsxs(_Fragment, { children: [_jsx(PopSearch, { value: query, placeholder: search.placeholder, onChange: onQuery, onKeyDown: (e) => e.key === "Enter" && onClose() }), _jsx("div", { className: "px-3 pb-2 text-[11px] text-sheet-faint", children: query.trim() ? `${matching} ${matching === 1 ? `${one} matches` : `${many} match`}` : search.hint })] }));
}
function ValueFilter({ label, values, hidden, onToggle, onOnly, onHideAll, onClose }) {
    const [search, setSearch] = useState("");
    const [at, setAt] = useState(-1);
    const shown = typeahead(values, search, (v) => v.value);
    const ticked = values.length - hidden.filter((h) => values.some((v) => v.value === h)).length;
    function onKey(e) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setAt(stepHighlight(at, shown.length, e.key));
        }
        else if (e.key === "Enter") {
            const pick = shown[at]?.value;
            if (pick)
                onOnly([pick]);
            else if (search.trim() && shown.length)
                onOnly(shown.map((v) => v.value));
            onClose();
        }
    }
    return (_jsxs(_Fragment, { children: [_jsx(PopSearch, { value: search, placeholder: `Type to filter ${label.toLowerCase()}…`, onChange: (text) => {
                    setSearch(text);
                    setAt(text ? 0 : -1);
                }, onKeyDown: onKey }), _jsxs("div", { className: "max-h-[280px] overflow-y-auto px-1 pb-1", role: "listbox", "aria-label": `${label} values`, children: [shown.length === 0 && _jsxs("div", { className: "px-2 py-3 text-center text-sheet-faint", children: ["Nothing matches \u201C", search, "\u201D"] }), shown.map(({ value, count }, i) => {
                        const on = !hidden.includes(value);
                        return (_jsxs("div", { role: "option", "aria-selected": i === at, onMouseEnter: () => setAt(i), onClick: () => onToggle(value), className: `group/opt flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 ${i === at ? "bg-sheet-accent-soft" : ""}`, children: [_jsx("span", { className: `sheet-tick ${on ? "sheet-tick-on" : ""}`, role: "checkbox", "aria-checked": on, "aria-label": value }), _jsx("span", { className: `min-w-0 flex-1 truncate ${value === BLANK ? "italic text-sheet-faint" : on ? "" : "text-sheet-faint"}`, children: value }), _jsx("button", { onClick: (e) => {
                                        e.stopPropagation();
                                        onOnly([value]);
                                    }, className: "hidden rounded px-1.5 text-[10px] font-semibold uppercase tracking-wide text-accent hover:bg-sheet-sunken group-hover/opt:block", children: "Only" }), _jsx("span", { className: "min-w-[22px] rounded-full bg-sheet-sunken px-1.5 text-center text-[10px] tabular-nums text-sheet-muted group-hover/opt:hidden", children: count })] }, value));
                    })] }), _jsxs("div", { className: "sheet-pop-foot flex items-center justify-between px-3 py-1.5 text-[11px]", children: [_jsxs("span", { className: "text-sheet-faint", children: [ticked, " of ", values.length, " shown"] }), _jsxs("span", { className: "flex gap-3", children: [_jsx("button", { className: "text-accent hover:underline", onClick: () => onOnly([]), children: "Show all" }), _jsx("button", { className: "text-sheet-muted hover:text-sheet-ink hover:underline", onClick: onHideAll, children: "Hide all" })] })] })] }));
}
// The sort, as a pair of buttons: a click picks a direction, a second click on it turns the sort off.
function SortBar({ column, sort, names = ["A → Z", "Z → A"], onSort }) {
    const dirs = ["asc", "desc"];
    return (_jsxs("div", { className: "sheet-pop-foot flex items-center gap-1 px-2 py-1.5", children: [_jsx("span", { className: "px-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-sheet-faint", children: "Sort" }), dirs.map((dir, i) => {
                const on = sort?.key === column && sort.dir === dir;
                return (_jsxs("button", { "aria-pressed": on, onClick: () => onSort(on ? null : dir), className: `flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-[11px] ${on ? "bg-accent text-white" : "text-sheet-muted hover:bg-sheet-sunken hover:text-sheet-ink"}`, children: [_jsx(SortGlyph, { dir: dir }), names[i]] }, dir));
            })] }));
}
// The sort arrow a header shows, and the sort buttons'.
export function SortGlyph({ dir }) {
    return (_jsx("svg", { width: "9", height: "9", viewBox: "0 0 10 10", "aria-hidden": true, className: "shrink-0", children: _jsx("path", { d: dir === "asc" ? "M5 2 9 8H1z" : "M5 8 1 2h8z", fill: "currentColor" }) }));
}
// The funnel a filtered header and the sheet's corner show.
export function FunnelGlyph() {
    return (_jsx("svg", { width: "10", height: "10", viewBox: "0 0 12 12", "aria-hidden": true, className: "shrink-0", children: _jsx("path", { d: "M1 2h10L7.2 6.6V10L4.8 11V6.6z", fill: "currentColor" }) }));
}
