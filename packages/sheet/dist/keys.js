// A sheet's keyboard (@aimhuge/sheet): start typing and the sheet searches. A sheet can
// make Space a leader with keys of its own after it (Weft's board list: Space then B for the Backlog); after Space,
// any key it doesn't name goes on to the page's own shortcuts. Keys the sheet keeps for the page (j and k, say)
// never start a search. Nothing here acts while you type in a field, hold a modifier, or have something open over
// the sheet. Pure, so the listener (client/useSheetKeys.ts) only does what this decides.
// How long Space waits for its second key.
export const LEADER_MS = 1500;
export function sheetKey(e, leader, options = {}) {
    if (e.meta || e.ctrl || e.alt || e.typing || e.blocked)
        return { kind: "pass" };
    const key = e.key.toLowerCase();
    if (leader) {
        const to = options.leaders?.[key];
        return to ? { kind: "lead", to } : { kind: "pass" };
    }
    if (e.key === " ")
        return options.leaders ? { kind: "leader" } : { kind: "pass" };
    if (e.key.length === 1 && !options.kept?.includes(key))
        return { kind: "search", text: e.key };
    return { kind: "pass" };
}
