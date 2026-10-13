/**
 * `timestampColumn` — the "5 minutes ago" cell that fastmonitor renders
 * everywhere. `formatDistanceToNow` from `date-fns` is the cheap, well-known
 * choice; we re-export it as a `ColumnDef` factory.
 *
 * Apps that need absolute dates should write their own column; this one is
 * deliberately opinionated for admin-table scanning.
 */
import { formatDistanceToNow } from "date-fns";
import { type ColumnDef } from "@tanstack/react-table";

export interface TimestampColumnOptions<T> {
  field: keyof T & string;
  label: string;
  /** A value of `null` renders as the placeholder; useful for soft-delete columns. */
  placeholder?: string;
  /** Pass `true` for the "soft-deleted at" column to invert the placeholder. */
  showPlaceholderWhenMissing?: boolean;
}

export function timestampColumn<T>({
  field,
  label,
  placeholder = "—",
  showPlaceholderWhenMissing = true,
}: TimestampColumnOptions<T>): ColumnDef<T> {
  return {
    id: field,
    accessorKey: field,
    header: label,
    cell: ({ row }: { row: { original: T } }) => {
      const value = row.original[field];
      if (value == null) {
        return showPlaceholderWhenMissing ? (
          <span className="text-admin-muted">{placeholder}</span>
        ) : null;
      }
      const date =
        value instanceof Date ? value : new Date(value as string | number);
      if (Number.isNaN(date.getTime())) {
        return <span className="text-admin-muted">{placeholder}</span>;
      }
      return (
        <span title={date.toISOString()} className="text-admin-muted">
          {formatDistanceToNow(date)} ago
        </span>
      );
    },
  };
}
