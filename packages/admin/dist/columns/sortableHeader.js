import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * `<SortableTableHeaderItem>` — the clickable header cell that drives the
 * page's `sort` state. The page owns `sort` (a string like `"createdAt desc"`)
 * and `setSort`; this component is purely a controlled widget.
 *
 * Clicking the same field twice toggles asc/desc. Clicking a different field
 * starts at desc (the convention in fastmonitor's admin pages; matches what
 * a human expects when they want "the most recent X").
 *
 * No app dependencies — just an arrow toggle from lucide-react.
 */
import { ArrowDown, ArrowUp } from "lucide-react";
/** Parse a "field dir" string into its parts, with a defensive fallback. */
export function parseSort(sort, fallbackField) {
    if (!sort)
        return { field: fallbackField, dir: "desc" };
    const [field, dir] = sort.split(/\s+/);
    return {
        field: field ?? fallbackField,
        dir: dir === "asc" ? "asc" : "desc",
    };
}
/** Inverse of `parseSort` — used by `setSort` to flip direction or switch fields. */
export function nextSort(current, clickedField, fallbackDir = "desc") {
    const { field, dir } = parseSort(current, clickedField);
    if (field === clickedField) {
        return `${clickedField} ${dir === "asc" ? "desc" : "asc"}`;
    }
    return `${clickedField} ${fallbackDir}`;
}
export function SortableTableHeaderItem({ field, fieldLabel, currentSort, setSort, }) {
    const { field: activeField, dir } = parseSort(currentSort, field);
    const isActive = activeField === field;
    const label = fieldLabel ?? field;
    const next = nextSort(currentSort, field);
    return (_jsxs("button", { type: "button", onClick: () => setSort(next), className: "inline-flex items-center gap-1 text-xs font-medium text-admin-muted hover:text-admin-text", "aria-sort": isActive ? (dir === "asc" ? "ascending" : "descending") : "none", children: [_jsx("span", { children: label }), isActive ? (dir === "asc" ? (_jsx(ArrowUp, { className: "h-3 w-3", "aria-hidden": "true" })) : (_jsx(ArrowDown, { className: "h-3 w-3", "aria-hidden": "true" }))) : null] }));
}
