export const AUDIENCE_OPTIONS = ["private", "link"];
export const AUDIENCE_LABEL = {
    private: "Only you and your team",
    link: "Anyone with the link",
};
export const LEVEL_OPTIONS = ["view", "edit"];
export const LEVEL_LABEL = {
    view: "Can view",
    edit: "Can view and edit",
};
export const GATE_OPTIONS = ["none", "email", "password"];
/** The gate select's option labels, worded for the thing being shared. */
export function gateLabels(noun) {
    return {
        none: `Nothing — open the ${noun} straight away`,
        email: "Their email address",
        password: "A password you share with them",
    };
}
/** Password is a view-only gate: `public_edit` has no password variant, only the
 *  email boolean. Offering it under "Can view and edit" would promise a door the
 *  schema can't build. */
export function gateOptionsFor(level) {
    return level === "edit" ? ["none", "email"] : GATE_OPTIONS;
}
/** Stored settings → the three axes the dialog renders. */
export function toAxes(mode, editRequiresEmail) {
    switch (mode) {
        case "private":
            return { audience: "private", level: "view", gate: "none" };
        case "public":
            return { audience: "link", level: "view", gate: "none" };
        case "email":
            return { audience: "link", level: "view", gate: "email" };
        case "password":
            return { audience: "link", level: "view", gate: "password" };
        case "public_edit":
            return { audience: "link", level: "edit", gate: editRequiresEmail ? "email" : "none" };
    }
}
/** The three axes → what to persist. Combinations the enum can't express are
 *  resolved toward the MORE closed setting, never the more open one:
 *   - private ignores level/gate entirely (there is no link to gate), but keeps
 *     the edit gate ON so flipping back to link-edit later can't silently land
 *     on anonymous editing.
 *   - edit + password isn't representable, so it becomes edit + email: still a
 *     door, and the one the resource can actually have. */
export function toMode(axes) {
    if (axes.audience === "private")
        return { mode: "private", editRequiresEmail: true };
    if (axes.level === "edit") {
        return { mode: "public_edit", editRequiresEmail: axes.gate !== "none" };
    }
    switch (axes.gate) {
        case "email":
            return { mode: "email", editRequiresEmail: true };
        case "password":
            return { mode: "password", editRequiresEmail: true };
        default:
            return { mode: "public", editRequiresEmail: true };
    }
}
/** Apply one axis change to the current axes, fixing up the others so the result
 *  is always a combination `toMode` can represent.
 *
 *  Opening a resource up is the one move that picks a default rather than
 *  preserving state: going private → link with the gate still on "none" would
 *  turn one click into a fully open link. It lands on the email gate instead:
 *  the link works for everyone, and the owner can see who opened it. */
export function withAxis(axes, patch) {
    const next = { ...axes, ...patch };
    if (patch.audience === "link" && axes.audience === "private" && patch.gate === undefined) {
        next.gate = "email";
    }
    if (!gateOptionsFor(next.level).includes(next.gate))
        next.gate = "email";
    return next;
}
/** The plain-English result of the three axes, aimed at "what happens when a
 *  stranger opens my link". `editLimits` is the app's own sentence about what a
 *  link-editor still can't do. */
export function consequenceOf(axes, noun, editLimits) {
    if (axes.audience === "private") {
        return "The link only works for you, your team, and anyone you add above.";
    }
    const door = axes.gate === "email"
        ? "give their email, then "
        : axes.gate === "password"
            ? "enter the password, then "
            : "";
    if (axes.level === "edit") {
        return `Anyone who has the link can ${door}change this ${noun}.${editLimits ? ` ${editLimits}` : ""}`;
    }
    return axes.gate === "none"
        ? `Anyone who has the link opens the ${noun} immediately — you won't know who they are.`
        : `Anyone who has the link can ${door}read the ${noun}.`;
}
