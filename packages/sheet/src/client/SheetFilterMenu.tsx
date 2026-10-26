"use client";

// A column's menu in a sheet (@aimhuge/sheet), opened by a click on its header and typed
// into straight away. The search column's box filters the rows as you type. Every other column's box narrows its
// values: ↑↓ move, Enter keeps only the one you're on (or every value you've matched), and each value has an Only
// button. The sort sits at the foot as two buttons rather than menu rows, so one click picks a direction.
import { useState } from "react";
import { BLANK, type SheetSortOf } from "../sheet.js";
import { stepHighlight, typeahead } from "../typeahead.js";
import { SheetPopover, PopSearch } from "./SheetPopover.js";

export interface SheetFilterMenuProps {
  column: string;
  label: string;
  anchor: DOMRect;
  sort: SheetSortOf;
  // The sort buttons' names; "A → Z" and "Z → A" unless the column says otherwise.
  sortNames?: [string, string];
  values: { value: string; count: number }[];
  hidden: string[];
  // This is the search column: its box is the sheet's search, worded by the sheet, with how many rows it leaves.
  search?: { placeholder: string; hint: string; noun: [string, string] };
  query: string;
  matching: number;
  onSort: (dir: "asc" | "desc" | null) => void;
  onToggle: (value: string) => void;
  // Keep only these values ticked; none shows every value again.
  onOnly: (keep: string[]) => void;
  onHideAll: () => void;
  onQuery: (text: string) => void;
  onClose: () => void;
}

export function SheetFilterMenu(props: SheetFilterMenuProps) {
  const { label, anchor, onClose, search } = props;
  return (
    <SheetPopover anchor={anchor} label={`${label} column`} width={search ? 300 : 264} onClose={onClose}>
      {search ? <SearchBox {...props} search={search} /> : <ValueFilter {...props} />}
      <SortBar column={props.column} sort={props.sort} names={props.sortNames} onSort={props.onSort} />
    </SheetPopover>
  );
}

function SearchBox({ query, matching, onQuery, onClose, search }: SheetFilterMenuProps & { search: NonNullable<SheetFilterMenuProps["search"]> }) {
  const [one, many] = search.noun;
  return (
    <>
      <PopSearch value={query} placeholder={search.placeholder} onChange={onQuery} onKeyDown={(e) => e.key === "Enter" && onClose()} />
      <div className="px-3 pb-2 text-[11px] text-sheet-faint">{query.trim() ? `${matching} ${matching === 1 ? `${one} matches` : `${many} match`}` : search.hint}</div>
    </>
  );
}

function ValueFilter({ label, values, hidden, onToggle, onOnly, onHideAll, onClose }: SheetFilterMenuProps) {
  const [search, setSearch] = useState("");
  const [at, setAt] = useState(-1);
  const shown = typeahead(values, search, (v) => v.value);
  const ticked = values.length - hidden.filter((h) => values.some((v) => v.value === h)).length;

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setAt(stepHighlight(at, shown.length, e.key));
    } else if (e.key === "Enter") {
      const pick = shown[at]?.value;
      if (pick) onOnly([pick]);
      else if (search.trim() && shown.length) onOnly(shown.map((v) => v.value));
      onClose();
    }
  }

  return (
    <>
      <PopSearch
        value={search}
        placeholder={`Type to filter ${label.toLowerCase()}…`}
        onChange={(text) => {
          setSearch(text);
          setAt(text ? 0 : -1);
        }}
        onKeyDown={onKey}
      />
      <div className="max-h-[280px] overflow-y-auto px-1 pb-1" role="listbox" aria-label={`${label} values`}>
        {shown.length === 0 && <div className="px-2 py-3 text-center text-sheet-faint">Nothing matches “{search}”</div>}
        {shown.map(({ value, count }, i) => {
          const on = !hidden.includes(value);
          return (
            <div
              key={value}
              role="option"
              aria-selected={i === at}
              onMouseEnter={() => setAt(i)}
              onClick={() => onToggle(value)}
              className={`group/opt flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 ${i === at ? "bg-sheet-accent-soft" : ""}`}
            >
              <span className={`sheet-tick ${on ? "sheet-tick-on" : ""}`} role="checkbox" aria-checked={on} aria-label={value} />
              <span className={`min-w-0 flex-1 truncate ${value === BLANK ? "italic text-sheet-faint" : on ? "" : "text-sheet-faint"}`}>{value}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOnly([value]);
                }}
                className="hidden rounded px-1.5 text-[10px] font-semibold uppercase tracking-wide text-accent hover:bg-sheet-sunken group-hover/opt:block"
              >
                Only
              </button>
              <span className="min-w-[22px] rounded-full bg-sheet-sunken px-1.5 text-center text-[10px] tabular-nums text-sheet-muted group-hover/opt:hidden">{count}</span>
            </div>
          );
        })}
      </div>
      <div className="sheet-pop-foot flex items-center justify-between px-3 py-1.5 text-[11px]">
        <span className="text-sheet-faint">
          {ticked} of {values.length} shown
        </span>
        <span className="flex gap-3">
          <button className="text-accent hover:underline" onClick={() => onOnly([])}>
            Show all
          </button>
          <button className="text-sheet-muted hover:text-sheet-ink hover:underline" onClick={onHideAll}>
            Hide all
          </button>
        </span>
      </div>
    </>
  );
}

// The sort, as a pair of buttons: a click picks a direction, a second click on it turns the sort off.
function SortBar({ column, sort, names = ["A → Z", "Z → A"], onSort }: { column: string; sort: SheetSortOf; names?: [string, string]; onSort: (dir: "asc" | "desc" | null) => void }) {
  const dirs = ["asc", "desc"] as const;
  return (
    <div className="sheet-pop-foot flex items-center gap-1 px-2 py-1.5">
      <span className="px-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-sheet-faint">Sort</span>
      {dirs.map((dir, i) => {
        const on = sort?.key === column && sort.dir === dir;
        return (
          <button
            key={dir}
            aria-pressed={on}
            onClick={() => onSort(on ? null : dir)}
            className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-[11px] ${on ? "bg-accent text-white" : "text-sheet-muted hover:bg-sheet-sunken hover:text-sheet-ink"}`}
          >
            <SortGlyph dir={dir} />
            {names[i]}
          </button>
        );
      })}
    </div>
  );
}

// The sort arrow a header shows, and the sort buttons'.
export function SortGlyph({ dir }: { dir: "asc" | "desc" }) {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden className="shrink-0">
      <path d={dir === "asc" ? "M5 2 9 8H1z" : "M5 8 1 2h8z"} fill="currentColor" />
    </svg>
  );
}

// The funnel a filtered header and the sheet's corner show.
export function FunnelGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden className="shrink-0">
      <path d="M1 2h10L7.2 6.6V10L4.8 11V6.6z" fill="currentColor" />
    </svg>
  );
}
