export const SHARE_MODES = ["private", "public", "email", "password", "public_edit"];
export function isShareMode(value) {
    return typeof value === "string" && SHARE_MODES.includes(value);
}
/** Modes where holding the link is enough to READ: no gate, no grant. */
export function linkGrantsRead(mode) {
    return mode === "public" || mode === "public_edit";
}
/** Modes where holding the link is enough to WRITE. Exactly one, and the app
 *  still decides whether the visitor must give an email first. */
export function linkGrantsEdit(mode) {
    return mode === "public_edit";
}
/** Modes that put an unlock form in front of the resource. */
export function modeHasGate(mode) {
    return mode === "email" || mode === "password";
}
/** Short form for a Share button's label. */
export const MODE_BUTTON_LABEL = {
    private: "Private",
    public: "Public",
    email: "Email gate",
    password: "Password",
    public_edit: "Open to edit",
};
