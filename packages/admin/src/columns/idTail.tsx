/**
 * `<IdTailCell>` — the "last 5 of the id, click to copy" cell that fastmonitor
 * uses on every admin table. Wraps the value in a button so the click target
 * is clear, and surfaces the full id in `title` for hover.
 *
 * Pairs with `idTailColumn` for the typical `ColumnDef` use.
 */
import { Copy } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";

export function IdTailCell({
  id,
  tail = 5,
  copyOnClick = true,
}: {
  id: string;
  tail?: number;
  copyOnClick?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const handleClick = useCallback(() => {
    if (!copyOnClick) return;
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard.writeText(id).then(() => {
      setCopied(true);
      // Auto-clear so the user gets feedback for a moment, then it goes away.
      window.setTimeout(() => setCopied(false), 1200);
    });
  }, [id, copyOnClick]);

  return (
    <button
      type="button"
      onClick={handleClick}
      title={id}
      className="inline-flex items-center gap-1 font-mono text-xs text-admin-muted hover:text-admin-text"
    >
      <span>…{id.slice(-tail)}</span>
      <Copy className="h-3 w-3" aria-hidden="true" />
      {copied ? <span className="text-admin-accent">copied</span> : null}
    </button>
  );
}

/** A ready-to-use `ColumnDef` for any row with an `id: string` field. */
export function idTailColumn<T extends { id: string }>({
  accessorKey = "id" as keyof T & string,
}: { accessorKey?: keyof T & string } = {}) {
  return {
    id: "id",
    accessorKey,
    header: "id",
    cell: ({ row }: { row: { original: T } }): ReactNode => (
      <IdTailCell id={String(row.original[accessorKey])} />
    ),
  } as const;
}
