import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * `timestampColumn` — the "5 minutes ago" cell that fastmonitor renders
 * everywhere. `formatDistanceToNow` from `date-fns` is the cheap, well-known
 * choice; we re-export it as a `ColumnDef` factory.
 *
 * Apps that need absolute dates should write their own column; this one is
 * deliberately opinionated for admin-table scanning.
 */
import { formatDistanceToNow } from "date-fns";
import {} from "@tanstack/react-table";
export function timestampColumn({ field, label, placeholder = "—", showPlaceholderWhenMissing = true, }) {
    return {
        id: field,
        accessorKey: field,
        header: label,
        cell: ({ row }) => {
            const value = row.original[field];
            if (value == null) {
                return showPlaceholderWhenMissing ? (_jsx("span", { className: "text-admin-muted", children: placeholder })) : null;
            }
            const date = value instanceof Date ? value : new Date(value);
            if (Number.isNaN(date.getTime())) {
                return _jsx("span", { className: "text-admin-muted", children: placeholder });
            }
            return (_jsxs("span", { title: date.toISOString(), className: "text-admin-muted", children: [formatDistanceToNow(date), " ago"] }));
        },
    };
}
