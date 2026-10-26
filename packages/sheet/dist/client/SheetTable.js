"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// @aimhuge/sheet's ready-made table: any list of rows as a sheet on frosted glass, like Weft's board list —
// grid lines, a numbered gutter, a header that stays put — with its behaviour: a click on a header opens a type-ahead
// filter (the search column filters rows as you type, the others narrow their values), a number column flips its
// sort, and typing anywhere starts the search. The sort, filters and search are kept in localStorage under its
// storage key. Hand it a spec (../sheet.ts), the rows, a cell per column and the columns' widths.
import { useMemo, useRef, useState } from "react";
import { filterCountOf, rowPasses, sortRows, parseSheet } from "../sheet.js";
import { useNow } from "./useNow.js";
import { SheetHeader } from "./SheetHeader.js";
import { FunnelGlyph } from "./SheetFilterMenu.js";
import { useSheetState } from "./useSheetState.js";
import { useSheetKeys } from "./useSheetKeys.js";
const NONE = { sort: null, hidden: {}, query: "", collapsed: [] };
export function SheetTable(props) {
    const { spec, rows, rowKey, cells = {}, widths, storageKey, onRowClick, loading, error, empty = "Nothing here yet.", className = "" } = props;
    const fresh = (props.fresh ?? NONE);
    const keys = useMemo(() => spec.columns.map((c) => c.key), [spec]);
    const sheet = useSheetState(storageKey, (raw) => parseSheet(raw, keys, [], fresh), fresh);
    const now = useNow();
    const [menu, setMenu] = useState(null);
    const glass = useRef(null);
    const shown = useMemo(() => sortRows(rows.filter((row) => rowPasses(row, spec, sheet.state.hidden, sheet.state.query, now)), spec, sheet.state.sort, now), [rows, spec, sheet.state, now]);
    const filters = filterCountOf(sheet.state.hidden, sheet.state.query);
    useSheetKeys({
        // A typed letter starts the search afresh, in the search column's menu.
        onSearch: (text) => {
            sheet.setQuery(text);
            const cell = glass.current?.querySelector(`[data-head="${spec.search.key}"]`);
            if (cell)
                setMenu({ key: spec.search.key, anchor: cell.getBoundingClientRect() });
        },
    });
    const style = { "--sheet-cols": widths.join(" ") };
    const cellOf = (key) => cells[key];
    return (_jsxs("div", { ref: glass, className: `sheet-glass flex min-h-0 flex-col overflow-auto ${className}`, style: style, children: [_jsxs("div", { className: "sheet-head-row sticky top-0 z-20 flex", children: [_jsx("span", { className: "sheet-gutter sheet-corner", children: filters > 0 && (_jsxs("button", { onClick: sheet.clearFilters, title: `Showing ${shown.length} of ${rows.length}. Clear ${filters === 1 ? "the filter" : `${filters} filters`}`, "aria-label": "Clear filters", className: "flex items-center gap-0.5 rounded px-1 text-accent hover:bg-sheet-sunken", children: [_jsx(FunnelGlyph, {}), "\u00D7"] })) }), _jsx("div", { className: "min-w-0 flex-1", children: _jsx(SheetHeader, { spec: spec, grid: "sheet-grid", state: sheet.state, rows: rows, shown: shown.length, now: now, actions: sheet, menu: menu, setMenu: setMenu }) })] }), _jsx("div", { className: loading && rows.length ? "opacity-60" : "", children: shown.map((row, i) => (_jsxs("div", { role: onRowClick ? "button" : undefined, tabIndex: onRowClick ? 0 : undefined, onClick: onRowClick ? () => onRowClick(row) : undefined, onKeyDown: onRowClick ? (e) => e.key === "Enter" && onRowClick(row) : undefined, className: `sheet-row sheet-table-row flex ${onRowClick ? "cursor-pointer" : ""}`, children: [_jsx("span", { className: "sheet-gutter", "aria-hidden": true, children: i + 1 }), _jsx("div", { className: "sheet-grid min-w-0 flex-1", children: spec.columns.map((column) => (_jsx("span", { className: `text-[12.5px] ${column.right ? "justify-end" : ""}`, children: cellOf(column.key)?.(row) ?? _jsx("span", { className: "truncate text-sheet-muted", children: column.values(row, now).join(", ") }) }, column.key))) })] }, rowKey(row)))) }), shown.length === 0 && _jsx(SheetMessage, { error: error, loading: loading, filtered: rows.length > 0, empty: empty, onClear: sheet.clearFilters })] }));
}
// An empty sheet's one line: the error, still loading, nothing matching the filters, or nothing at all.
function SheetMessage({ error, loading, filtered, empty, onClear }) {
    if (error)
        return _jsx("div", { className: "px-4 py-8 text-center text-[13px] text-sheet-danger", children: error });
    if (loading)
        return _jsx("div", { className: "px-4 py-8 text-center text-[13px] text-sheet-muted", children: "Loading\u2026" });
    if (!filtered)
        return _jsx("div", { className: "px-4 py-8 text-center text-[13px] text-sheet-muted", children: empty });
    return (_jsxs("div", { className: "flex flex-col items-center gap-2 px-4 py-8 text-[13px] text-sheet-muted", children: ["Nothing matches these filters.", _jsx("button", { onClick: onClear, className: "text-accent hover:underline", children: "Clear filters" })] }));
}
