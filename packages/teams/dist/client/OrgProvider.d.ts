import { type ReactNode } from "react";
import type { Org, OrgRole } from "../server/members.js";
/** The shape a workspace chrome layer needs: the current org, the caller's
 *  role, the full org list (for the switcher), and a few booleans. Apps
 *  populate this from their own loader — the package does not fetch it. */
export interface OrgContextValue {
    org: Org;
    role: OrgRole;
    orgs: Org[];
    isSuperAdmin: boolean;
}
export declare function OrgProvider({ value, children, }: {
    value: OrgContextValue;
    children: ReactNode;
}): import("react").JSX.Element;
export declare function useOrg(): OrgContextValue;
