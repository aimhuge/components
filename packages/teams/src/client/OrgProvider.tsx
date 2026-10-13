"use client";

import { createContext, useContext, type ReactNode } from "react";
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

const Ctx = createContext<OrgContextValue | null>(null);

export function OrgProvider({
  value,
  children,
}: {
  value: OrgContextValue;
  children: ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOrg(): OrgContextValue {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error("useOrg must be called inside <OrgProvider>");
  }
  return v;
}