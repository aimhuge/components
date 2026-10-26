import { type SheetSortOf } from "../sheet.js";
export interface SheetFilterMenuProps {
    column: string;
    label: string;
    anchor: DOMRect;
    sort: SheetSortOf;
    sortNames?: [string, string];
    values: {
        value: string;
        count: number;
    }[];
    hidden: string[];
    search?: {
        placeholder: string;
        hint: string;
        noun: [string, string];
    };
    query: string;
    matching: number;
    onSort: (dir: "asc" | "desc" | null) => void;
    onToggle: (value: string) => void;
    onOnly: (keep: string[]) => void;
    onHideAll: () => void;
    onQuery: (text: string) => void;
    onClose: () => void;
}
export declare function SheetFilterMenu(props: SheetFilterMenuProps): import("react").JSX.Element;
export declare function SortGlyph({ dir }: {
    dir: "asc" | "desc";
}): import("react").JSX.Element;
export declare function FunnelGlyph(): import("react").JSX.Element;
