export declare const BLANK = "(blank)";
export type SortDir = "asc" | "desc";
export type SheetSortOf<K extends string = string> = {
    key: K;
    dir: SortDir;
} | null;
export interface SheetStateOf<K extends string = string, B extends string = string> {
    sort: SheetSortOf<K>;
    hidden: Partial<Record<K, string[]>>;
    query: string;
    collapsed: B[];
}
export interface SheetColumn<T, K extends string = string> {
    key: K;
    label: string;
    values: (row: T, now: number) => string[];
    filter?: boolean;
    number?: (row: T, now: number) => number | null;
    rank?: (value: string) => number;
    flip?: boolean;
    right?: boolean;
    sortNames?: [string, string];
}
export interface SheetSpec<T, K extends string = string> {
    columns: SheetColumn<T, K>[];
    search: {
        key: K;
        text: (row: T) => string;
        placeholder: string;
        hint: string;
        noun: [string, string];
    };
}
export declare function columnOf<T, K extends string>(spec: SheetSpec<T, K>, key: K | undefined): SheetColumn<T, K> | undefined;
export declare function compareValues<T, K extends string>(column: SheetColumn<T, K>, a: string, b: string): number;
export declare function sortItems<T, K extends string, I>(items: I[], rowOf: (item: I) => T, spec: SheetSpec<T, K>, sort: SheetSortOf<K>, now: number): I[];
export declare function sortRows<T, K extends string>(rows: T[], spec: SheetSpec<T, K>, sort: SheetSortOf<K>, now: number): T[];
export declare function rowPasses<T, K extends string>(row: T, spec: SheetSpec<T, K>, hidden: Partial<Record<K, string[]>>, query: string, now: number): boolean;
export declare function valueCountsOf<T, K extends string>(rows: T[], column: SheetColumn<T, K>, now: number): {
    value: string;
    count: number;
}[];
export declare function nextSortOf<K extends string>(sort: SheetSortOf<K>, key: K): SheetSortOf<K>;
export declare function flipSortOf<K extends string>(sort: SheetSortOf<K>, key: K): SheetSortOf<K>;
export declare function toggleHiddenOf<K extends string>(hidden: Partial<Record<K, string[]>>, key: K, value: string): Partial<Record<K, string[]>>;
export declare function keepOnlyOf<K extends string>(hidden: Partial<Record<K, string[]>>, key: K, all: string[], keep: string[]): Partial<Record<K, string[]>>;
export declare function toggleIn<B>(list: B[], item: B): B[];
export declare function filterCountOf(hidden: Partial<Record<string, string[]>>, query?: string): number;
export declare function parseSheet<K extends string, B extends string>(raw: string | null, keys: readonly K[], bands: readonly B[], fresh: SheetStateOf<K, B>): SheetStateOf<K, B>;
export declare const TIME_ORDER: string[];
export declare function timeBucket(at: number | null, now: number): string;
