// @aimhuge/sheet's core: a table described as columns, sorted and filtered the way Google
// Sheets does — "Sort A→Z", "Filter by values", a search box — for any kind of row. Each column says what values a row
// has in it, what it sorts by, and whether its header flips a sort or opens a menu; this works out the rest. Pure, so
// a table (client/SheetTable.tsx, or an app's own) only draws what it decides.
import { matches } from "./typeahead.js";

export const BLANK = "(blank)";
export type SortDir = "asc" | "desc";
export type SheetSortOf<K extends string = string> = { key: K; dir: SortDir } | null;

export interface SheetStateOf<K extends string = string, B extends string = string> {
  sort: SheetSortOf<K>;
  // Per column, the values unticked: a row is hidden when every value it has is unticked. Keeping the hidden ones
  // (not the shown ones) means a value that turns up later shows by default.
  hidden: Partial<Record<K, string[]>>;
  // The search: typed into the search column's header, or anywhere on the sheet.
  query: string;
  // Bands (groups of rows) folded shut, for a sheet that has them.
  collapsed: B[];
}

export interface SheetColumn<T, K extends string = string> {
  key: K;
  label: string;
  // The values a row has in this column, as its filter's checklist names them; several for something like tags.
  values: (row: T, now: number) => string[];
  // Its values make a checklist worth filtering by (a name or a title is too unique to).
  filter?: boolean;
  // A number to sort by (an age, a date), lowest first ascending; null sorts with the blanks. Without it, the values.
  number?: (row: T, now: number) => number | null;
  // A value's place where A→Z isn't the order (a pipeline's stages, statuses loudest first).
  rank?: (value: string) => number;
  // A click on the header flips the sort instead of opening the menu: for numbers, whose order is obvious.
  flip?: boolean;
  right?: boolean;
  // The menu's sort buttons, when "A → Z" and "Z → A" don't say it ("Newest first", "Oldest first").
  sortNames?: [string, string];
}

export interface SheetSpec<T, K extends string = string> {
  columns: SheetColumn<T, K>[];
  // The column whose header holds the search, the text of a row it matches, and how its box reads: a placeholder,
  // a hint under it, and what a row is called ("card", "cards") for its count.
  search: { key: K; text: (row: T) => string; placeholder: string; hint: string; noun: [string, string] };
}

export function columnOf<T, K extends string>(spec: SheetSpec<T, K>, key: K | undefined): SheetColumn<T, K> | undefined {
  return spec.columns.find((c) => c.key === key);
}

function isBlank(values: string[]) {
  return !values.length || values.every((v) => v === BLANK);
}

export function compareValues<T, K extends string>(column: SheetColumn<T, K>, a: string, b: string) {
  const rank = column.rank;
  return (rank ? rank(a) - rank(b) : 0) || a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

// Sorts items that carry a row by one column. Blanks stay at the bottom either way, as in Sheets, and a tie keeps the
// items' own order, so a table with no sort reads as it came.
export function sortItems<T, K extends string, I>(items: I[], rowOf: (item: I) => T, spec: SheetSpec<T, K>, sort: SheetSortOf<K>, now: number): I[] {
  const column = columnOf(spec, sort?.key);
  if (!sort || !column) return items;
  const sign = sort.dir === "asc" ? 1 : -1;
  return items
    .map((item, i) => {
      const row = rowOf(item);
      const values = column.values(row, now);
      const n = column.number ? column.number(row, now) : undefined;
      // A row with several values sorts by them in turn, as one string.
      return { item, i, text: values.join(", "), n, blank: n === null || (n === undefined && isBlank(values)) };
    })
    .sort((a, b) => {
      if (a.blank !== b.blank) return a.blank ? 1 : -1;
      const diff = a.n != null && b.n != null ? a.n - b.n : compareValues(column, a.text, b.text);
      return sign * diff || a.i - b.i;
    })
    .map((r) => r.item);
}

export function sortRows<T, K extends string>(rows: T[], spec: SheetSpec<T, K>, sort: SheetSortOf<K>, now: number): T[] {
  return sortItems(rows, (row) => row, spec, sort, now);
}

// Whether a row passes the sheet's filters: the search (every word typed is in its text) and, in every filtered
// column, at least one of its values still ticked.
export function rowPasses<T, K extends string>(row: T, spec: SheetSpec<T, K>, hidden: Partial<Record<K, string[]>>, query: string, now: number) {
  if (query.trim() && !matches(spec.search.text(row), query)) return false;
  return spec.columns.every((column) => {
    const list = hidden[column.key];
    return !list?.length || column.values(row, now).some((v) => !list.includes(v));
  });
}

// The checklist a column's menu shows: each value with how many rows have it, in the column's order, blanks last.
export function valueCountsOf<T, K extends string>(rows: T[], column: SheetColumn<T, K>, now: number): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) for (const v of new Set(column.values(row, now))) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => {
      if ((a.value === BLANK) !== (b.value === BLANK)) return a.value === BLANK ? 1 : -1;
      return compareValues(column, a.value, b.value);
    });
}

// A header's sort, as in Sheets: A→Z, then Z→A, then back to the table's own order.
export function nextSortOf<K extends string>(sort: SheetSortOf<K>, key: K): SheetSortOf<K> {
  if (sort?.key !== key) return { key, dir: "asc" };
  return sort.dir === "asc" ? { key, dir: "desc" } : null;
}

// A number column's header just flips: lowest first, highest first, and back.
export function flipSortOf<K extends string>(sort: SheetSortOf<K>, key: K): SheetSortOf<K> {
  return { key, dir: sort?.key === key && sort.dir === "asc" ? "desc" : "asc" };
}

// Ticks or unticks one value in a column's filter.
export function toggleHiddenOf<K extends string>(hidden: Partial<Record<K, string[]>>, key: K, value: string): Partial<Record<K, string[]>> {
  const list = hidden[key] ?? [];
  return { ...hidden, [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] };
}

// Keeps only these values ticked in a column ("Only", or Enter on what was typed); keeping none clears it.
export function keepOnlyOf<K extends string>(hidden: Partial<Record<K, string[]>>, key: K, all: string[], keep: string[]): Partial<Record<K, string[]>> {
  return { ...hidden, [key]: keep.length ? all.filter((v) => !keep.includes(v)) : [] };
}

// Adds an item to a list, or takes it out: a band folded or opened.
export function toggleIn<B>(list: B[], item: B): B[] {
  return list.includes(item) ? list.filter((c) => c !== item) : [...list, item];
}

// How many filters are on (each filtered column, and the search), for the sheet's Clear.
export function filterCountOf(hidden: Partial<Record<string, string[]>>, query = "") {
  return Object.values(hidden).filter((list) => list?.length).length + (query.trim() ? 1 : 0);
}

// A sheet saved in localStorage, read back: what it doesn't know (a column or a band that's gone) is dropped, and
// anything unreadable is a fresh sheet.
export function parseSheet<K extends string, B extends string>(raw: string | null, keys: readonly K[], bands: readonly B[], fresh: SheetStateOf<K, B>): SheetStateOf<K, B> {
  if (!raw) return fresh;
  try {
    const data = JSON.parse(raw) as { sort?: { key?: string; dir?: string } | null; hidden?: Record<string, unknown>; query?: unknown; collapsed?: unknown };
    const key = data.sort?.key as K;
    const dir = data.sort?.dir;
    const sort: SheetSortOf<K> = keys.includes(key) && (dir === "asc" || dir === "desc") ? { key, dir } : null;
    const hidden: Partial<Record<K, string[]>> = {};
    for (const k of keys) {
      const list = data.hidden?.[k];
      if (Array.isArray(list)) hidden[k] = list.filter((v): v is string => typeof v === "string");
    }
    const query = typeof data.query === "string" ? data.query : "";
    // A sheet saved before it had bands starts with the fresh sheet's folds.
    const collapsed = Array.isArray(data.collapsed) ? data.collapsed.filter((c): c is B => bands.includes(c as B)) : fresh.collapsed;
    return { sort, hidden, query, collapsed };
  } catch {
    return fresh;
  }
}

// How long ago a time was, as a date column's filter names it: Today, This week, This month, This year, Older.
// A missing time is BLANK. TIME_ORDER is their order, for a column's rank.
const DAY = 86_400_000;
const TIME_BUCKETS: { label: string; under: number }[] = [
  { label: "Today", under: DAY },
  { label: "This week", under: 7 * DAY },
  { label: "This month", under: 31 * DAY },
  { label: "This year", under: 365 * DAY },
];
export const TIME_ORDER = [...TIME_BUCKETS.map((b) => b.label), "Older"];

export function timeBucket(at: number | null, now: number): string {
  if (at === null || Number.isNaN(at)) return BLANK;
  const ago = Math.max(0, now - at);
  return TIME_BUCKETS.find((b) => ago < b.under)?.label ?? "Older";
}
