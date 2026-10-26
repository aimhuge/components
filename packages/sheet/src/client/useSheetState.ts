"use client";

// A sheet's sort, filters, search and folded bands, kept in localStorage under its own key so it comes back the way
// you left it (@aimhuge/sheet). An external store: the server render reads the fresh
// sheet, the browser the saved one, and a change in another window (the storage event) shows here too.
import { useMemo, useSyncExternalStore } from "react";
import { flipSortOf, keepOnlyOf, toggleHiddenOf, toggleIn, type SheetStateOf } from "../sheet.js";

function storeFor<K extends string, B extends string>(storageKey: string, parse: (raw: string | null) => SheetStateOf<K, B>, fresh: SheetStateOf<K, B>) {
  const event = `weft:sheet:${storageKey}`;
  // The parsed sheet for the raw string last read, so a snapshot only changes when the saved one does.
  let cached: { raw: string | null; state: SheetStateOf<K, B> } = { raw: null, state: fresh };
  const read = () => {
    const raw = window.localStorage.getItem(storageKey);
    if (raw !== cached.raw) cached = { raw, state: parse(raw) };
    return cached.state;
  };
  const subscribe = (onChange: () => void) => {
    window.addEventListener(event, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(event, onChange);
      window.removeEventListener("storage", onChange);
    };
  };
  const update = (next: (s: SheetStateOf<K, B>) => SheetStateOf<K, B>) => {
    window.localStorage.setItem(storageKey, JSON.stringify(next(read())));
    window.dispatchEvent(new Event(event));
  };
  return { read, subscribe, update };
}

export function useSheetState<K extends string, B extends string = never>(storageKey: string, parse: (raw: string | null) => SheetStateOf<K, B>, fresh: SheetStateOf<K, B>) {
  // One store per key for the component's life; parse and fresh are the sheet's constants.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const store = useMemo(() => storeFor(storageKey, parse, fresh), [storageKey]);
  const state = useSyncExternalStore(store.subscribe, store.read, () => fresh);
  const { update } = store;
  return {
    state,
    setSort: (key: K, dir: "asc" | "desc" | null) => update((s) => ({ ...s, sort: dir ? { key, dir } : null })),
    flip: (key: K) => update((s) => ({ ...s, sort: flipSortOf(s.sort, key) })),
    toggle: (key: K, value: string) => update((s) => ({ ...s, hidden: toggleHiddenOf(s.hidden, key, value) })),
    only: (key: K, all: string[], keep: string[]) => update((s) => ({ ...s, hidden: keepOnlyOf(s.hidden, key, all, keep) })),
    hideAll: (key: K, all: string[]) => update((s) => ({ ...s, hidden: { ...s.hidden, [key]: all } })),
    setQuery: (query: string) => update((s) => ({ ...s, query })),
    toggleBand: (band: B) => update((s) => ({ ...s, collapsed: toggleIn(s.collapsed, band) })),
    clearFilters: () => update((s) => ({ ...s, hidden: {}, query: "" })),
  };
}
