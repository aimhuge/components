import { type ReactNode } from "react";
export declare function IdTailCell({ id, tail, copyOnClick, }: {
    id: string;
    tail?: number;
    copyOnClick?: boolean;
}): import("react").JSX.Element;
/** A ready-to-use `ColumnDef` for any row with an `id: string` field. */
export declare function idTailColumn<T extends {
    id: string;
}>({ accessorKey, }?: {
    accessorKey?: keyof T & string;
}): {
    readonly id: "id";
    readonly accessorKey: keyof T & string;
    readonly header: "id";
    readonly cell: ({ row }: {
        row: {
            original: T;
        };
    }) => ReactNode;
};
