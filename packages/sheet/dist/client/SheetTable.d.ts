import { type ReactNode } from "react";
import { type SheetSpec, type SheetStateOf } from "../sheet.js";
export interface SheetTableProps<T, K extends string> {
    spec: SheetSpec<T, K>;
    rows: T[];
    rowKey: (row: T) => string;
    cells?: Partial<Record<K, (row: T) => ReactNode>>;
    widths: string[];
    storageKey: string;
    fresh?: SheetStateOf<K>;
    onRowClick?: (row: T) => void;
    loading?: boolean;
    error?: string | null;
    empty?: ReactNode;
    className?: string;
}
export declare function SheetTable<T, K extends string>(props: SheetTableProps<T, K>): import("react").JSX.Element;
