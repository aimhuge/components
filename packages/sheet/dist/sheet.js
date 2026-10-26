// @aimhuge/sheet's core: a table described as columns, sorted and filtered the way Google
// Sheets does — "Sort A→Z", "Filter by values", a search box — for any kind of row. Each column says what values a row
// has in it, what it sorts by, and whether its header flips a sort or opens a menu; this works out the rest. Pure, so
// a table (client/SheetTable.tsx, or an app's own) only draws what it decides.
import { matches } from "./typeahead.js";
export const BLANK = "(blank)";
export function columnOf(spec, key) {
    return spec.columns.find((c) => c.key === key);
}
function isBlank(values) {
    return !values.length || values.every((v) => v === BLANK);
}
export function compareValues(column, a, b) {
    const rank = column.rank;
    return (rank ? rank(a) - rank(b) : 0) || a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}
// Sorts items that carry a row by one column. Blanks stay at the bottom either way, as in Sheets, and a tie keeps the
// items' own order, so a table with no sort reads as it came.
export function sortItems(items, rowOf, spec, sort, now) {
    const column = columnOf(spec, sort?.key);
    if (!sort || !column)
        return items;
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
        if (a.blank !== b.blank)
            return a.blank ? 1 : -1;
        const diff = a.n != null && b.n != null ? a.n - b.n : compareValues(column, a.text, b.text);
        return sign * diff || a.i - b.i;
    })
        .map((r) => r.item);
}
export function sortRows(rows, spec, sort, now) {
    return sortItems(rows, (row) => row, spec, sort, now);
}
// Whether a row passes the sheet's filters: the search (every word typed is in its text) and, in every filtered
// column, at least one of its values still ticked.
export function rowPasses(row, spec, hidden, query, now) {
    if (query.trim() && !matches(spec.search.text(row), query))
        return false;
    return spec.columns.every((column) => {
        const list = hidden[column.key];
        return !list?.length || column.values(row, now).some((v) => !list.includes(v));
    });
}
// The checklist a column's menu shows: each value with how many rows have it, in the column's order, blanks last.
export function valueCountsOf(rows, column, now) {
    const counts = new Map();
    for (const row of rows)
        for (const v of new Set(column.values(row, now)))
            counts.set(v, (counts.get(v) ?? 0) + 1);
    return [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => {
        if ((a.value === BLANK) !== (b.value === BLANK))
            return a.value === BLANK ? 1 : -1;
        return compareValues(column, a.value, b.value);
    });
}
// A header's sort, as in Sheets: A→Z, then Z→A, then back to the table's own order.
export function nextSortOf(sort, key) {
    if (sort?.key !== key)
        return { key, dir: "asc" };
    return sort.dir === "asc" ? { key, dir: "desc" } : null;
}
// A number column's header just flips: lowest first, highest first, and back.
export function flipSortOf(sort, key) {
    return { key, dir: sort?.key === key && sort.dir === "asc" ? "desc" : "asc" };
}
// Ticks or unticks one value in a column's filter.
export function toggleHiddenOf(hidden, key, value) {
    const list = hidden[key] ?? [];
    return { ...hidden, [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] };
}
// Keeps only these values ticked in a column ("Only", or Enter on what was typed); keeping none clears it.
export function keepOnlyOf(hidden, key, all, keep) {
    return { ...hidden, [key]: keep.length ? all.filter((v) => !keep.includes(v)) : [] };
}
// Adds an item to a list, or takes it out: a band folded or opened.
export function toggleIn(list, item) {
    return list.includes(item) ? list.filter((c) => c !== item) : [...list, item];
}
// How many filters are on (each filtered column, and the search), for the sheet's Clear.
export function filterCountOf(hidden, query = "") {
    return Object.values(hidden).filter((list) => list?.length).length + (query.trim() ? 1 : 0);
}
// A sheet saved in localStorage, read back: what it doesn't know (a column or a band that's gone) is dropped, and
// anything unreadable is a fresh sheet.
export function parseSheet(raw, keys, bands, fresh) {
    if (!raw)
        return fresh;
    try {
        const data = JSON.parse(raw);
        const key = data.sort?.key;
        const dir = data.sort?.dir;
        const sort = keys.includes(key) && (dir === "asc" || dir === "desc") ? { key, dir } : null;
        const hidden = {};
        for (const k of keys) {
            const list = data.hidden?.[k];
            if (Array.isArray(list))
                hidden[k] = list.filter((v) => typeof v === "string");
        }
        const query = typeof data.query === "string" ? data.query : "";
        // A sheet saved before it had bands starts with the fresh sheet's folds.
        const collapsed = Array.isArray(data.collapsed) ? data.collapsed.filter((c) => bands.includes(c)) : fresh.collapsed;
        return { sort, hidden, query, collapsed };
    }
    catch {
        return fresh;
    }
}
// How long ago a time was, as a date column's filter names it: Today, This week, This month, This year, Older.
// A missing time is BLANK. TIME_ORDER is their order, for a column's rank.
const DAY = 86_400_000;
const TIME_BUCKETS = [
    { label: "Today", under: DAY },
    { label: "This week", under: 7 * DAY },
    { label: "This month", under: 31 * DAY },
    { label: "This year", under: 365 * DAY },
];
export const TIME_ORDER = [...TIME_BUCKETS.map((b) => b.label), "Older"];
export function timeBucket(at, now) {
    if (at === null || Number.isNaN(at))
        return BLANK;
    const ago = Math.max(0, now - at);
    return TIME_BUCKETS.find((b) => ago < b.under)?.label ?? "Older";
}
