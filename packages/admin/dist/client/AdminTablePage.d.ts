import { type ColumnDef } from "@tanstack/react-table";
import { type SuperAdminSession } from "./SuperAdminBanner.js";
import { type SearchControlsProps } from "./SearchControls.js";
/** Minimal shape a resource query must return. The page uses `rows` for the
 *  table body and `total` for the "X of Y" summary + page math. */
export interface ResourceQueryResult<T> {
    rows: T[];
    total: number;
    isLoading: boolean;
    error?: {
        message: string;
    } | null;
}
/** A hook the app writes, scoped to one resource. */
export type ResourceQueryHook<T> = (args: {
    skip: number;
    take: number;
    searchTerm: string;
    sort: string;
}) => ResourceQueryResult<T>;
export interface AdminTablePageProps<T> {
    title: string;
    resource: string;
    session: SuperAdminSession | null | undefined;
    columns: ColumnDef<T>[];
    useResourceQuery: ResourceQueryHook<T>;
    /** Defaults to 20, matching fastmonitor's pages. */
    itemsPerPage?: number;
    /** Initial sort string in "field dir" form. Defaults to "createdAt desc". */
    initialSort?: string;
    searchPlaceholder?: string;
    /** Optional search input extras (toggles, filters). */
    searchExtras?: SearchControlsProps["extras"];
    /** Override the default banner. */
    banner?: React.ReactNode;
    /** App-level className for the outer wrapper. */
    className?: string;
}
export declare function AdminTablePage<T>({ title, resource, session, columns, useResourceQuery, itemsPerPage, initialSort, searchPlaceholder, searchExtras, banner, className, }: AdminTablePageProps<T>): import("react").JSX.Element;
