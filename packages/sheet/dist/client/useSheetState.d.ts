import { type SheetStateOf } from "../sheet.js";
export declare function useSheetState<K extends string, B extends string = never>(storageKey: string, parse: (raw: string | null) => SheetStateOf<K, B>, fresh: SheetStateOf<K, B>): {
    state: SheetStateOf<K, B>;
    setSort: (key: K, dir: "asc" | "desc" | null) => void;
    flip: (key: K) => void;
    toggle: (key: K, value: string) => void;
    only: (key: K, all: string[], keep: string[]) => void;
    hideAll: (key: K, all: string[]) => void;
    setQuery: (query: string) => void;
    toggleBand: (band: B) => void;
    clearFilters: () => void;
};
