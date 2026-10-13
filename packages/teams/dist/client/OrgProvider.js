"use client";
import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext } from "react";
const Ctx = createContext(null);
export function OrgProvider({ value, children, }) {
    return _jsx(Ctx.Provider, { value: value, children: children });
}
export function useOrg() {
    const v = useContext(Ctx);
    if (!v) {
        throw new Error("useOrg must be called inside <OrgProvider>");
    }
    return v;
}
