/**
 * `<AdminTablePage>` — the shape of a super-admin page. Wires together:
 *
 *   <SuperAdminBanner/>         — who is acting
 *   <SearchControls/>           — debounced search, page count, extras slot
 *   <table> with columns        — app-supplied ColumnDef<T>[]
 *   row count + "X of Y"        — visible scan summary
 *   pagination                  — prev/next, plus page counter
 *
 * The data fetching is left to the app: pass a `useResourceQuery` callback
 * that accepts the page arguments and returns the rows + total. The page is
 * deliberately a thin shell so the apps keep their trpc / Prisma / Supabase
 * choices.
 */
"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { flexRender, getCoreRowModel, useReactTable, } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { SuperAdminBanner } from "./SuperAdminBanner.js";
import { SearchControls, } from "./SearchControls.js";
import { useDebouncedSearch } from "./useDebouncedSearch.js";
export function AdminTablePage({ title, resource, session, columns, useResourceQuery, itemsPerPage = 20, initialSort = "createdAt desc", searchPlaceholder, searchExtras, banner, className, }) {
    const [page, setPage] = useState(1);
    const [sort, setSort] = useState(initialSort);
    const { searchTerm, setSearchTerm, debouncedSearchTerm } = useDebouncedSearch("");
    const { rows, total, isLoading, error } = useResourceQuery({
        skip: itemsPerPage * (page - 1),
        take: itemsPerPage,
        searchTerm: debouncedSearchTerm,
        sort,
    });
    const totalPages = Math.max(1, Math.ceil(total / itemsPerPage));
    // Memoize the table instance so it doesn't rebuild on every parent render.
    const table = useReactTable({
        columns,
        data: rows,
        getCoreRowModel: getCoreRowModel(),
    });
    // Stable references to the headers / cells.
    const headerGroups = useMemo(() => table.getHeaderGroups(), [table]);
    const rowModel = useMemo(() => table.getRowModel(), [table]);
    return (_jsxs("div", { className: [
            "flex flex-col gap-4 p-4 text-admin-text",
            className,
        ]
            .filter(Boolean)
            .join(" "), "data-resource": resource, children: [_jsxs("header", { className: "flex flex-col gap-1", children: [_jsx("h1", { className: "text-xl font-semibold text-admin-text", children: title }), banner ?? _jsx(SuperAdminBanner, { session: session })] }), _jsx(SearchControls, { searchTerm: searchTerm, onSearchChange: setSearchTerm, placeholder: searchPlaceholder, currentPage: page, totalPages: totalPages, isLoading: isLoading, extras: searchExtras }), _jsxs("div", { className: "flex items-center justify-between text-xs text-admin-muted", children: [_jsxs("span", { children: [rows.length, " of ", total, " ", resource] }), isLoading ? (_jsx(Loader2, { className: "h-3.5 w-3.5 animate-spin", "aria-label": "loading" })) : null] }), error ? (_jsxs("p", { className: "text-sm text-admin-error", children: ["Error loading ", resource, ": ", error.message] })) : null, _jsx("div", { className: "overflow-x-auto rounded-md border border-admin-border", children: _jsxs("table", { className: "min-w-full divide-y divide-admin-border text-sm", children: [_jsx("thead", { className: "bg-admin-surface text-admin-muted", children: headerGroups.map((group) => (_jsx("tr", { children: group.headers.map((header) => (_jsx("th", { scope: "col", className: "px-3 py-2 text-left text-xs font-medium uppercase tracking-wide", children: header.isPlaceholder
                                        ? null
                                        : flexRender(header.column.columnDef.header, header.getContext()) }, header.id))) }, group.id))) }), _jsx("tbody", { className: "divide-y divide-admin-border bg-admin-bg", children: rowModel.rows.length === 0 && !isLoading ? (_jsx("tr", { children: _jsxs("td", { colSpan: columns.length, className: "px-3 py-6 text-center text-sm text-admin-muted", children: ["No ", resource, " match the current filters."] }) })) : (rowModel.rows.map((row) => (_jsx("tr", { className: "hover:bg-admin-surface", children: row.getVisibleCells().map((cell) => (_jsx("td", { className: "px-3 py-2 align-middle", children: flexRender(cell.column.columnDef.cell, cell.getContext()) }, cell.id))) }, row.id)))) })] }) }), _jsxs("nav", { className: "flex items-center justify-between text-xs text-admin-muted", "aria-label": "Pagination", children: [_jsxs("button", { type: "button", onClick: () => setPage((p) => Math.max(1, p - 1)), disabled: page <= 1, className: "inline-flex items-center gap-1 rounded-md border border-admin-border bg-admin-surface px-2 py-1 hover:text-admin-text disabled:opacity-50", children: [_jsx(ChevronLeft, { className: "h-3.5 w-3.5", "aria-hidden": "true" }), "Prev"] }), _jsxs("span", { children: ["Page ", page, " of ", totalPages] }), _jsxs("button", { type: "button", onClick: () => setPage((p) => Math.min(totalPages, p + 1)), disabled: page >= totalPages, className: "inline-flex items-center gap-1 rounded-md border border-admin-border bg-admin-surface px-2 py-1 hover:text-admin-text disabled:opacity-50", children: ["Next", _jsx(ChevronRight, { className: "h-3.5 w-3.5", "aria-hidden": "true" })] })] })] }));
}
