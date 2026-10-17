import type { ReactNode } from "react";
import { type ShareAxes } from "../axes.js";
/** The slice of `useShareAccess` this section draws. An app with its own hook
 *  passes anything of this shape. */
export type ShareAccessControls = {
    axes: ShareAxes | null;
    saving: boolean;
    saved: boolean;
    error: string | null;
    saveAxis: (patch: Partial<ShareAxes>) => unknown;
    hasPassword: boolean;
    password: string;
    setPassword: (value: string) => void;
    savePassword: () => unknown;
};
/** "General access": the resource-wide share mode, asked as the three questions
 *  it actually is instead of one fused enum:
 *
 *    Who can open it   →  private / anyone with the link
 *    What they can do  →  view / view and edit     (hidden when allowEdit is false)
 *    Asked for first   →  nothing / an email / a password   (link only)
 *
 *  A single select made people decode combinations ("Anyone with the link can
 *  edit": gated or not?). The axes module owns the mapping back to the mode and
 *  refuses to emit a combination the schema can't hold.
 *
 *  `children` render under the consequence line: the app's own access toggles
 *  (DeckCP's comment settings). */
export declare function ShareAccessFields({ s, noun, allowEdit, editLimits, children, }: {
    s: ShareAccessControls;
    /** What's being shared, in copy: "deck", "thread", "page". */
    noun?: string;
    /** False for a resource strangers can't write to; the level row disappears. */
    allowEdit?: boolean;
    /** One sentence on what a link-editor still can't do. */
    editLimits?: string;
    children?: ReactNode;
}): import("react").JSX.Element;
