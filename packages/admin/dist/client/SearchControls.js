import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
/**
 * `<SearchControls>` — the strip above the table: total count, current page
 * out of N, and the search input. Renders the `?` placeholder and the live
 * `searchTerm` value (the input is controlled by the page, not local state,
 * so the page can reset it programmatically).
 */
import { Search } from "lucide-react";
export function SearchControls({ searchTerm, onSearchChange, placeholder = "Search…", currentPage, totalPages, isLoading, extras, }) {
    return (_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsxs("span", { className: "text-xs text-admin-muted", children: ["Page ", currentPage, " of ", totalPages, isLoading ? " · loading…" : ""] }), _jsxs("div", { className: "relative flex-1 min-w-[12rem] max-w-xs", children: [_jsx(Search, { className: "pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-admin-muted", "aria-hidden": "true" }), _jsx("input", { type: "search", value: searchTerm, onChange: (e) => onSearchChange(e.target.value), placeholder: placeholder, className: "w-full rounded-md border border-admin-border bg-admin-surface py-1.5 pl-7 pr-2 text-sm text-admin-text placeholder:text-admin-muted focus:border-admin-accent focus:outline-none" })] }), extras] }));
}
