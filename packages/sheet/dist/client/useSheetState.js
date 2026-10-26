"use client";
// A sheet's sort, filters, search and folded bands, kept in localStorage under its own key so it comes back the way
// you left it (@aimhuge/sheet). An external store: the server render reads the fresh
// sheet, the browser the saved one, and a change in another window (the storage event) shows here too.
import { useMemo, useSyncExternalStore } from "react";
import { flipSortOf, keepOnlyOf, toggleHiddenOf, toggleIn } from "../sheet.js";
function storeFor(storageKey, parse, fresh) {
    const event = `weft:sheet:${storageKey}`;
    // The parsed sheet for the raw string last read, so a snapshot only changes when the saved one does.
    let cached = { raw: null, state: fresh };
    const read = () => {
        const raw = window.localStorage.getItem(storageKey);
        if (raw !== cached.raw)
            cached = { raw, state: parse(raw) };
        return cached.state;
    };
    const subscribe = (onChange) => {
        window.addEventListener(event, onChange);
        window.addEventListener("storage", onChange);
        return () => {
            window.removeEventListener(event, onChange);
            window.removeEventListener("storage", onChange);
        };
    };
    const update = (next) => {
        window.localStorage.setItem(storageKey, JSON.stringify(next(read())));
        window.dispatchEvent(new Event(event));
    };
    return { read, subscribe, update };
}
export function useSheetState(storageKey, parse, fresh) {
    // One store per key for the component's life; parse and fresh are the sheet's constants.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const store = useMemo(() => storeFor(storageKey, parse, fresh), [storageKey]);
    const state = useSyncExternalStore(store.subscribe, store.read, () => fresh);
    const { update } = store;
    return {
        state,
        setSort: (key, dir) => update((s) => ({ ...s, sort: dir ? { key, dir } : null })),
        flip: (key) => update((s) => ({ ...s, sort: flipSortOf(s.sort, key) })),
        toggle: (key, value) => update((s) => ({ ...s, hidden: toggleHiddenOf(s.hidden, key, value) })),
        only: (key, all, keep) => update((s) => ({ ...s, hidden: keepOnlyOf(s.hidden, key, all, keep) })),
        hideAll: (key, all) => update((s) => ({ ...s, hidden: { ...s.hidden, [key]: all } })),
        setQuery: (query) => update((s) => ({ ...s, query })),
        toggleBand: (band) => update((s) => ({ ...s, collapsed: toggleIn(s.collapsed, band) })),
        clearFilters: () => update((s) => ({ ...s, hidden: {}, query: "" })),
    };
}
