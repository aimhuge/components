"use client";

// @aimhuge/sheet's ready-made table: any list of rows as a sheet on frosted glass, like Weft's board list —
// grid lines, a numbered gutter, a header that stays put — with its behaviour: a click on a header opens a type-ahead
// filter (the search column filters rows as you type, the others narrow their values), a number column flips its
// sort, and typing anywhere starts the search. The sort, filters and search are kept in localStorage under its
// storage key. Hand it a spec (../sheet.ts), the rows, a cell per column and the columns' widths.
import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { filterCountOf, rowPasses, sortRows, parseSheet, type SheetSpec, type SheetStateOf } from "../sheet.js";
import { useNow } from "./useNow.js";
import { SheetHeader, type HeaderMenu } from "./SheetHeader.js";
import { FunnelGlyph } from "./SheetFilterMenu.js";
import { useSheetState } from "./useSheetState.js";
import { useSheetKeys } from "./useSheetKeys.js";

export interface SheetTableProps<T, K extends string> {
  spec: SheetSpec<T, K>;
  rows: T[];
  rowKey: (row: T) => string;
  // How a column draws its cell; a column without one shows its values.
  cells?: Partial<Record<K, (row: T) => ReactNode>>;
  // Each column's width, as a grid track ("minmax(0, 2fr)", "120px"), in the spec's column order.
  widths: string[];
  // Where the sort, filters and search are kept, and the sheet before any are set.
  storageKey: string;
  fresh?: SheetStateOf<K>;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  error?: string | null;
  // What an empty sheet says, before any filter.
  empty?: ReactNode;
  className?: string;
}

const NONE = { sort: null, hidden: {}, query: "", collapsed: [] };

export function SheetTable<T, K extends string>(props: SheetTableProps<T, K>) {
  const { spec, rows, rowKey, cells = {}, widths, storageKey, onRowClick, loading, error, empty = "Nothing here yet.", className = "" } = props;
  const fresh = (props.fresh ?? NONE) as SheetStateOf<K>;
  const keys = useMemo(() => spec.columns.map((c) => c.key), [spec]);
  const sheet = useSheetState<K, string>(storageKey, (raw) => parseSheet(raw, keys, [], fresh), fresh);
  const now = useNow();
  const [menu, setMenu] = useState<HeaderMenu>(null);
  const glass = useRef<HTMLDivElement>(null);
  const shown = useMemo(
    () => sortRows(rows.filter((row) => rowPasses(row, spec, sheet.state.hidden, sheet.state.query, now)), spec, sheet.state.sort, now),
    [rows, spec, sheet.state, now],
  );
  const filters = filterCountOf(sheet.state.hidden, sheet.state.query);
  useSheetKeys({
    // A typed letter starts the search afresh, in the search column's menu.
    onSearch: (text) => {
      sheet.setQuery(text);
      const cell = glass.current?.querySelector(`[data-head="${spec.search.key}"]`);
      if (cell) setMenu({ key: spec.search.key, anchor: cell.getBoundingClientRect() });
    },
  });
  const style = { "--sheet-cols": widths.join(" ") } as CSSProperties;
  const cellOf = (key: string) => (cells as Partial<Record<string, (row: T) => ReactNode>>)[key];

  return (
    <div ref={glass} className={`sheet-glass flex min-h-0 flex-col overflow-auto ${className}`} style={style}>
      <div className="sheet-head-row sticky top-0 z-20 flex">
        <span className="sheet-gutter sheet-corner">
          {filters > 0 && (
            <button
              onClick={sheet.clearFilters}
              title={`Showing ${shown.length} of ${rows.length}. Clear ${filters === 1 ? "the filter" : `${filters} filters`}`}
              aria-label="Clear filters"
              className="flex items-center gap-0.5 rounded px-1 text-accent hover:bg-sheet-sunken"
            >
              <FunnelGlyph />×
            </button>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <SheetHeader spec={spec} grid="sheet-grid" state={sheet.state} rows={rows} shown={shown.length} now={now} actions={sheet} menu={menu} setMenu={setMenu} />
        </div>
      </div>
      <div className={loading && rows.length ? "opacity-60" : ""}>
        {shown.map((row, i) => (
          <div
            key={rowKey(row)}
            role={onRowClick ? "button" : undefined}
            tabIndex={onRowClick ? 0 : undefined}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            onKeyDown={onRowClick ? (e) => e.key === "Enter" && onRowClick(row) : undefined}
            className={`sheet-row sheet-table-row flex ${onRowClick ? "cursor-pointer" : ""}`}
          >
            <span className="sheet-gutter" aria-hidden>
              {i + 1}
            </span>
            <div className="sheet-grid min-w-0 flex-1">
              {spec.columns.map((column) => (
                <span key={column.key} className={`text-[12.5px] ${column.right ? "justify-end" : ""}`}>
                  {cellOf(column.key)?.(row) ?? <span className="truncate text-sheet-muted">{column.values(row, now).join(", ")}</span>}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      {shown.length === 0 && <SheetMessage error={error} loading={loading} filtered={rows.length > 0} empty={empty} onClear={sheet.clearFilters} />}
    </div>
  );
}

// An empty sheet's one line: the error, still loading, nothing matching the filters, or nothing at all.
function SheetMessage({ error, loading, filtered, empty, onClear }: { error?: string | null; loading?: boolean; filtered: boolean; empty: ReactNode; onClear: () => void }) {
  if (error) return <div className="px-4 py-8 text-center text-[13px] text-sheet-danger">{error}</div>;
  if (loading) return <div className="px-4 py-8 text-center text-[13px] text-sheet-muted">Loading…</div>;
  if (!filtered) return <div className="px-4 py-8 text-center text-[13px] text-sheet-muted">{empty}</div>;
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-[13px] text-sheet-muted">
      Nothing matches these filters.
      <button onClick={onClear} className="text-accent hover:underline">
        Clear filters
      </button>
    </div>
  );
}
