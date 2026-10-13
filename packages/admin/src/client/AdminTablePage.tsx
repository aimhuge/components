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

import { useMemo, useState } from "react";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import { SuperAdminBanner, type SuperAdminSession } from "./SuperAdminBanner.js";
import {
  SearchControls,
  type SearchControlsProps,
} from "./SearchControls.js";
import { useDebouncedSearch } from "./useDebouncedSearch.js";

/** Minimal shape a resource query must return. The page uses `rows` for the
 *  table body and `total` for the "X of Y" summary + page math. */
export interface ResourceQueryResult<T> {
  rows: T[];
  total: number;
  isLoading: boolean;
  error?: { message: string } | null;
}

/** A hook the app writes, scoped to one resource. */
export type ResourceQueryHook<T> = (args: {
  skip: number;
  take: number;
  searchTerm: string;
  sort: string;
}) => ResourceQueryResult<T>;

export interface AdminTablePageProps<T> {
  title: string;
  resource: string;
  session: SuperAdminSession | null | undefined;
  columns: ColumnDef<T>[];
  useResourceQuery: ResourceQueryHook<T>;
  /** Defaults to 20, matching fastmonitor's pages. */
  itemsPerPage?: number;
  /** Initial sort string in "field dir" form. Defaults to "createdAt desc". */
  initialSort?: string;
  searchPlaceholder?: string;
  /** Optional search input extras (toggles, filters). */
  searchExtras?: SearchControlsProps["extras"];
  /** Override the default banner. */
  banner?: React.ReactNode;
  /** App-level className for the outer wrapper. */
  className?: string;
}

export function AdminTablePage<T>({
  title,
  resource,
  session,
  columns,
  useResourceQuery,
  itemsPerPage = 20,
  initialSort = "createdAt desc",
  searchPlaceholder,
  searchExtras,
  banner,
  className,
}: AdminTablePageProps<T>) {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState(initialSort);
  const { searchTerm, setSearchTerm, debouncedSearchTerm } =
    useDebouncedSearch("");

  const { rows, total, isLoading, error } = useResourceQuery({
    skip: itemsPerPage * (page - 1),
    take: itemsPerPage,
    searchTerm: debouncedSearchTerm,
    sort,
  });

  const totalPages = Math.max(1, Math.ceil(total / itemsPerPage));

  // Memoize the table instance so it doesn't rebuild on every parent render.
  const table = useReactTable<T>({
    columns,
    data: rows,
    getCoreRowModel: getCoreRowModel(),
  });

  // Stable references to the headers / cells.
  const headerGroups = useMemo(() => table.getHeaderGroups(), [table]);
  const rowModel = useMemo(() => table.getRowModel(), [table]);

  return (
    <div
      className={[
        "flex flex-col gap-4 p-4 text-admin-text",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-resource={resource}
    >
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-admin-text">{title}</h1>
        {banner ?? <SuperAdminBanner session={session} />}
      </header>

      <SearchControls
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        placeholder={searchPlaceholder}
        currentPage={page}
        totalPages={totalPages}
        isLoading={isLoading}
        extras={searchExtras}
      />

      <div className="flex items-center justify-between text-xs text-admin-muted">
        <span>
          {rows.length} of {total} {resource}
        </span>
        {isLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="loading" />
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-admin-error">
          Error loading {resource}: {error.message}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-md border border-admin-border">
        <table className="min-w-full divide-y divide-admin-border text-sm">
          <thead className="bg-admin-surface text-admin-muted">
            {headerGroups.map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <th
                    key={header.id}
                    scope="col"
                    className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-admin-border bg-admin-bg">
            {rowModel.rows.length === 0 && !isLoading ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-6 text-center text-sm text-admin-muted"
                >
                  No {resource} match the current filters.
                </td>
              </tr>
            ) : (
              rowModel.rows.map((row) => (
                <tr key={row.id} className="hover:bg-admin-surface">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <nav
        className="flex items-center justify-between text-xs text-admin-muted"
        aria-label="Pagination"
      >
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="inline-flex items-center gap-1 rounded-md border border-admin-border bg-admin-surface px-2 py-1 hover:text-admin-text disabled:opacity-50"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Prev
        </button>
        <span>
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
          className="inline-flex items-center gap-1 rounded-md border border-admin-border bg-admin-surface px-2 py-1 hover:text-admin-text disabled:opacity-50"
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </nav>
    </div>
  );
}
