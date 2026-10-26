"use client";

// A sheet's header row (@aimhuge/sheet). A click on a column's name opens its menu with
// the cursor already in the search box, so you click and type: the search column filters the rows, every other
// column narrows its values. A number column flips its sort on a click instead, with a funnel beside it for its
// menu. A filtered header says what it's filtered to (“bug”, 2/7), so the sheet always shows what it's doing.
import { columnOf, valueCountsOf, type SheetColumn, type SheetSpec, type SheetStateOf } from "../sheet.js";
import { SheetFilterMenu, FunnelGlyph, SortGlyph } from "./SheetFilterMenu.js";

export interface SheetActions<K extends string = string> {
  setSort: (key: K, dir: "asc" | "desc" | null) => void;
  flip: (key: K) => void;
  toggle: (key: K, value: string) => void;
  only: (key: K, all: string[], keep: string[]) => void;
  hideAll: (key: K, all: string[]) => void;
  setQuery: (query: string) => void;
}

// The header menu that's open, and the cell it hangs from. The sheet holds it, so typing can open the search.
export type HeaderMenu = { key: string; anchor: DOMRect } | null;

export interface SheetHeaderProps<T, K extends string> {
  spec: SheetSpec<T, K>;
  // The grid's class (its column template), shared with the rows so a header sits over its cells.
  grid: string;
  state: SheetStateOf<K>;
  // Every row the sheet has, before its own filters, so a menu lists every value.
  rows: T[];
  // How many rows the filters leave, for the search's count.
  shown: number;
  now: number;
  actions: SheetActions<K>;
  menu: HeaderMenu;
  setMenu: (menu: HeaderMenu) => void;
  // Empty cells after the columns, for a trailing column of buttons the header has no name for.
  trailing?: number;
}

// What a filtered header says it's filtered to: the search, the one value left, or how many are.
function summary<T, K extends string>(column: SheetColumn<T, K>, spec: SheetSpec<T, K>, state: SheetStateOf<K>, rows: T[], now: number) {
  if (column.key === spec.search.key) return state.query.trim() ? `“${state.query.trim()}”` : null;
  const hidden = state.hidden[column.key];
  if (!hidden?.length) return null;
  const all = valueCountsOf(rows, column, now).map((v) => v.value);
  const left = all.filter((v) => !hidden.includes(v));
  return left.length === 1 ? left[0] : `${left.length}/${all.length}`;
}

export function SheetHeader<T, K extends string>(props: SheetHeaderProps<T, K>) {
  const { spec, grid, state, rows, shown, now, actions, menu, setMenu, trailing = 0 } = props;
  const open = columnOf(spec, menu?.key as K | undefined);
  const searching = open?.key === spec.search.key;
  const values = open && !searching ? valueCountsOf(rows, open, now) : [];
  const all = values.map((v) => v.value);

  return (
    <div className={`${grid} sheet-head`}>
      {spec.columns.map((column) => (
        <HeaderCell
          key={column.key}
          column={column}
          search={column.key === spec.search.key}
          sorted={state.sort?.key === column.key ? state.sort.dir : null}
          note={summary(column, spec, state, rows, now)}
          open={menu?.key === column.key}
          onFlip={() => actions.flip(column.key)}
          onMenu={(cell) => setMenu(menu?.key === column.key ? null : { key: column.key, anchor: cell.getBoundingClientRect() })}
        />
      ))}
      {Array.from({ length: trailing }, (_, i) => (
        <span key={`trailing-${i}`} />
      ))}
      {menu && open && (
        <SheetFilterMenu
          column={open.key}
          label={open.label}
          anchor={menu.anchor}
          sort={state.sort}
          sortNames={open.sortNames}
          values={values}
          hidden={state.hidden[open.key] ?? []}
          search={searching ? spec.search : undefined}
          query={state.query}
          matching={shown}
          onSort={(dir) => actions.setSort(open.key, dir)}
          onToggle={(value) => actions.toggle(open.key, value)}
          onOnly={(keep) => actions.only(open.key, all, keep)}
          onHideAll={() => actions.hideAll(open.key, all)}
          onQuery={actions.setQuery}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

// One header cell: its name, its sort arrow and what it's filtered to. A click opens its menu, or on a
// number column flips the sort, with a funnel beside it for the menu.
function HeaderCell<T, K extends string>(props: {
  column: SheetColumn<T, K>;
  search: boolean;
  sorted: "asc" | "desc" | null;
  note: string | null | undefined;
  open: boolean;
  onFlip: () => void;
  onMenu: (cell: HTMLElement) => void;
}) {
  const { column, search, sorted, note, open, onFlip, onMenu } = props;
  const name = column.label.toLowerCase();
  const ariaSort = sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none";
  const title = column.flip
    ? `Sort by ${name}: click to flip`
    : search
      ? `Filter or sort by ${name}: click and type, or just start typing anywhere`
      : `Filter or sort by ${name}: click and type`;
  return (
    <span data-head={column.key} className={`sheet-head-cell group/head ${column.right ? "justify-end" : ""} ${open ? "sheet-head-open" : ""}`} aria-sort={ariaSort}>
      <button
        className={`flex min-w-0 items-center gap-1.5 uppercase hover:text-sheet-ink ${column.right ? "order-2" : "flex-1"} ${sorted || note ? "text-accent" : ""}`}
        onClick={(e) => (column.flip ? onFlip() : onMenu(e.currentTarget.parentElement as HTMLElement))}
        title={title}
      >
        <span className="shrink-0">{column.label}</span>
        {sorted && <SortGlyph dir={sorted} />}
        {note && <span className="sheet-head-note truncate normal-case tracking-normal">{note}</span>}
      </button>
      {column.flip && (
        <button
          aria-label={`${column.label} column menu`}
          title={`Filter by ${name}`}
          onClick={(e) => onMenu(e.currentTarget.parentElement as HTMLElement)}
          className={`order-1 mr-auto shrink-0 rounded p-0.5 hover:bg-sheet-sunken hover:text-sheet-ink ${note ? "text-accent" : "opacity-0 group-hover/head:opacity-100"}`}
        >
          <FunnelGlyph />
        </button>
      )}
    </span>
  );
}
