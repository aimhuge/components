/** Share modes for one shared resource (a deck, a thread, a page).
 *
 *  A resource is 'private' by default: only its owner and their workspace can
 *  open it. Sharing opens it up: 'public' (anyone with the link), 'email'
 *  (capture an email first), 'password', or 'public_edit' (anyone with the link
 *  can EDIT). For the gated modes, passing the gate mints a signed, httpOnly
 *  cookie scoped to that resource so the visitor isn't asked again (see
 *  `createShareGate` in `@aimhuge/share/server`). 'private' is not a gate: the
 *  app enforces it against the owner/workspace, with no unlock form.
 *
 *  'public_edit' is the ONLY mode where the link grants more than read. It reads
 *  like 'public' and, once the visitor is identified, writes like an editor
 *  grant. An app whose resource can't take strangers' writes (Weft's threads)
 *  passes `allowEdit: false` to the dialog and never stores it. */
export type ShareMode = "private" | "public" | "email" | "password" | "public_edit";
export declare const SHARE_MODES: readonly ShareMode[];
export declare function isShareMode(value: unknown): value is ShareMode;
/** Modes where holding the link is enough to READ: no gate, no grant. */
export declare function linkGrantsRead(mode: ShareMode): boolean;
/** Modes where holding the link is enough to WRITE. Exactly one, and the app
 *  still decides whether the visitor must give an email first. */
export declare function linkGrantsEdit(mode: ShareMode): boolean;
/** Modes that put an unlock form in front of the resource. */
export declare function modeHasGate(mode: ShareMode): mode is "email" | "password";
/** Short form for a Share button's label. */
export declare const MODE_BUTTON_LABEL: Record<ShareMode, string>;
