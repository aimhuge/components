import type { ShareMode } from "./modes.js";
/** The Share dialog's "general access" control, decomposed.
 *
 *  `ShareMode` is a single enum that fuses three independent questions, which is
 *  why one 5-option select read as a riddle ("Anyone with the link can edit": do
 *  they also need an email? "…after giving their email": can they edit?). The
 *  dialog asks them separately and maps back to the enum here:
 *
 *    WHO   — private (owner/workspace/grantees) vs. anyone holding the link
 *    LEVEL — what a link-holder may do: view, or view AND edit
 *    GATE  — what they hand over at the door first: nothing, an email, a password
 *
 *  Not every cell exists in the enum: `public_edit` carries its gate in a
 *  separate `editRequiresEmail` boolean and has no password variant. That
 *  asymmetry is contained here, in pure functions, rather than smeared across
 *  the UI: `toMode` never emits an unrepresentable combination. */
export type ShareAudience = "private" | "link";
export type ShareLevel = "view" | "edit";
export type ShareGate = "none" | "email" | "password";
export type ShareAxes = {
    audience: ShareAudience;
    level: ShareLevel;
    gate: ShareGate;
};
/** What `toMode` writes: the stored enum plus the link-edit gate boolean, which
 *  is the only place the 'edit' column of the gate axis can live. */
export type ShareAccess = {
    mode: ShareMode;
    editRequiresEmail: boolean;
};
export declare const AUDIENCE_OPTIONS: ShareAudience[];
export declare const AUDIENCE_LABEL: Record<ShareAudience, string>;
export declare const LEVEL_OPTIONS: ShareLevel[];
export declare const LEVEL_LABEL: Record<ShareLevel, string>;
export declare const GATE_OPTIONS: ShareGate[];
/** The gate select's option labels, worded for the thing being shared. */
export declare function gateLabels(noun: string): Record<ShareGate, string>;
/** Password is a view-only gate: `public_edit` has no password variant, only the
 *  email boolean. Offering it under "Can view and edit" would promise a door the
 *  schema can't build. */
export declare function gateOptionsFor(level: ShareLevel): ShareGate[];
/** Stored settings → the three axes the dialog renders. */
export declare function toAxes(mode: ShareMode, editRequiresEmail: boolean): ShareAxes;
/** The three axes → what to persist. Combinations the enum can't express are
 *  resolved toward the MORE closed setting, never the more open one:
 *   - private ignores level/gate entirely (there is no link to gate), but keeps
 *     the edit gate ON so flipping back to link-edit later can't silently land
 *     on anonymous editing.
 *   - edit + password isn't representable, so it becomes edit + email: still a
 *     door, and the one the resource can actually have. */
export declare function toMode(axes: ShareAxes): ShareAccess;
/** Apply one axis change to the current axes, fixing up the others so the result
 *  is always a combination `toMode` can represent.
 *
 *  Opening a resource up is the one move that picks a default rather than
 *  preserving state: going private → link with the gate still on "none" would
 *  turn one click into a fully open link. It lands on the email gate instead:
 *  the link works for everyone, and the owner can see who opened it. */
export declare function withAxis(axes: ShareAxes, patch: Partial<ShareAxes>): ShareAxes;
/** The plain-English result of the three axes, aimed at "what happens when a
 *  stranger opens my link". `editLimits` is the app's own sentence about what a
 *  link-editor still can't do. */
export declare function consequenceOf(axes: ShareAxes, noun: string, editLimits?: string): string;
