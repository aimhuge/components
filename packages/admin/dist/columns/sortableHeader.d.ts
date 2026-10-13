export type SortDirection = "asc" | "desc";
/** Parse a "field dir" string into its parts, with a defensive fallback. */
export declare function parseSort(sort: string | undefined, fallbackField: string): {
    field: string;
    dir: SortDirection;
};
/** Inverse of `parseSort` — used by `setSort` to flip direction or switch fields. */
export declare function nextSort(current: string | undefined, clickedField: string, fallbackDir?: SortDirection): string;
export declare function SortableTableHeaderItem({ field, fieldLabel, currentSort, setSort, }: {
    field: string;
    fieldLabel?: string;
    currentSort: string;
    setSort: (sort: string) => void;
}): import("react").JSX.Element;
