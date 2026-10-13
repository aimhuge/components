import { type ColumnDef } from "@tanstack/react-table";
export interface TimestampColumnOptions<T> {
    field: keyof T & string;
    label: string;
    /** A value of `null` renders as the placeholder; useful for soft-delete columns. */
    placeholder?: string;
    /** Pass `true` for the "soft-deleted at" column to invert the placeholder. */
    showPlaceholderWhenMissing?: boolean;
}
export declare function timestampColumn<T>({ field, label, placeholder, showPlaceholderWhenMissing, }: TimestampColumnOptions<T>): ColumnDef<T>;
