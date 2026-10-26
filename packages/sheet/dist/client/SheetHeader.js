"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// A sheet's header row (@aimhuge/sheet). A click on a column's name opens its menu with
// the cursor already in the search box, so you click and type: the search column filters the rows, every other
// column narrows its values. A number column flips its sort on a click instead, with a funnel beside it for its
// menu. A filtered header says what it's filtered to (“bug”, 2/7), so the sheet always shows what it's doing.
import { columnOf, valueCountsOf } from "../sheet.js";
import { SheetFilterMenu, FunnelGlyph, SortGlyph } from "./SheetFilterMenu.js";
// What a filtered header says it's filtered to: the search, the one value left, or how many are.
function summary(column, spec, state, rows, now) {
    if (column.key === spec.search.key)
        return state.query.trim() ? `“${state.query.trim()}”` : null;
    const hidden = state.hidden[column.key];
    if (!hidden?.length)
        return null;
    const all = valueCountsOf(rows, column, now).map((v) => v.value);
    const left = all.filter((v) => !hidden.includes(v));
    return left.length === 1 ? left[0] : `${left.length}/${all.length}`;
}
export function SheetHeader(props) {
    const { spec, grid, state, rows, shown, now, actions, menu, setMenu, trailing = 0 } = props;
    const open = columnOf(spec, menu?.key);
    const searching = open?.key === spec.search.key;
    const values = open && !searching ? valueCountsOf(rows, open, now) : [];
    const all = values.map((v) => v.value);
    return (_jsxs("div", { className: `${grid} sheet-head`, children: [spec.columns.map((column) => (_jsx(HeaderCell, { column: column, search: column.key === spec.search.key, sorted: state.sort?.key === column.key ? state.sort.dir : null, note: summary(column, spec, state, rows, now), open: menu?.key === column.key, onFlip: () => actions.flip(column.key), onMenu: (cell) => setMenu(menu?.key === column.key ? null : { key: column.key, anchor: cell.getBoundingClientRect() }) }, column.key))), Array.from({ length: trailing }, (_, i) => (_jsx("span", {}, `trailing-${i}`))), menu && open && (_jsx(SheetFilterMenu, { column: open.key, label: open.label, anchor: menu.anchor, sort: state.sort, sortNames: open.sortNames, values: values, hidden: state.hidden[open.key] ?? [], search: searching ? spec.search : undefined, query: state.query, matching: shown, onSort: (dir) => actions.setSort(open.key, dir), onToggle: (value) => actions.toggle(open.key, value), onOnly: (keep) => actions.only(open.key, all, keep), onHideAll: () => actions.hideAll(open.key, all), onQuery: actions.setQuery, onClose: () => setMenu(null) }))] }));
}
// One header cell: its name, its sort arrow and what it's filtered to. A click opens its menu, or on a
// number column flips the sort, with a funnel beside it for the menu.
function HeaderCell(props) {
    const { column, search, sorted, note, open, onFlip, onMenu } = props;
    const name = column.label.toLowerCase();
    const ariaSort = sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none";
    const title = column.flip
        ? `Sort by ${name}: click to flip`
        : search
            ? `Filter or sort by ${name}: click and type, or just start typing anywhere`
            : `Filter or sort by ${name}: click and type`;
    return (_jsxs("span", { "data-head": column.key, className: `sheet-head-cell group/head ${column.right ? "justify-end" : ""} ${open ? "sheet-head-open" : ""}`, "aria-sort": ariaSort, children: [_jsxs("button", { className: `flex min-w-0 items-center gap-1.5 uppercase hover:text-sheet-ink ${column.right ? "order-2" : "flex-1"} ${sorted || note ? "text-accent" : ""}`, onClick: (e) => (column.flip ? onFlip() : onMenu(e.currentTarget.parentElement)), title: title, children: [_jsx("span", { className: "shrink-0", children: column.label }), sorted && _jsx(SortGlyph, { dir: sorted }), note && _jsx("span", { className: "sheet-head-note truncate normal-case tracking-normal", children: note })] }), column.flip && (_jsx("button", { "aria-label": `${column.label} column menu`, title: `Filter by ${name}`, onClick: (e) => onMenu(e.currentTarget.parentElement), className: `order-1 mr-auto shrink-0 rounded p-0.5 hover:bg-sheet-sunken hover:text-sheet-ink ${note ? "text-accent" : "opacity-0 group-hover/head:opacity-100"}`, children: _jsx(FunnelGlyph, {}) }))] }));
}
