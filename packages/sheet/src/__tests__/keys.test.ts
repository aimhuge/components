import { describe, expect, it } from "vitest";
import { sheetKey, type SheetKeyEvent } from "../keys.js";

// A key event with nothing held and nothing blocking the sheet.
function key(k: string, overrides: Partial<SheetKeyEvent> = {}): SheetKeyEvent {
  return { key: k, meta: false, ctrl: false, alt: false, typing: false, blocked: false, ...overrides };
}

describe("sheetKey", () => {
  it("searches for a printable key", () => {
    expect(sheetKey(key("a"), false)).toEqual({ kind: "search", text: "a" });
    expect(sheetKey(key("Z"), false)).toEqual({ kind: "search", text: "Z" });
    expect(sheetKey(key("7"), false)).toEqual({ kind: "search", text: "7" });
  });

  it("leaves a key the sheet keeps to the page", () => {
    expect(sheetKey(key("j"), false, { kept: ["j"] })).toEqual({ kind: "pass" });
    expect(sheetKey(key("J"), false, { kept: ["j"] })).toEqual({ kind: "pass" });
  });

  it("passes a named key the page handles", () => {
    expect(sheetKey(key("Enter"), false)).toEqual({ kind: "pass" });
    expect(sheetKey(key("Escape"), false)).toEqual({ kind: "pass" });
    expect(sheetKey(key("ArrowDown"), false)).toEqual({ kind: "pass" });
  });

  it("makes Space a leader only when the sheet has leaders", () => {
    expect(sheetKey(key(" "), false, { leaders: { b: "backlog" } })).toEqual({ kind: "leader" });
    expect(sheetKey(key(" "), false)).toEqual({ kind: "pass" });
  });

  it("acts on the key after a leader", () => {
    expect(sheetKey(key("b"), true, { leaders: { b: "backlog" } })).toEqual({ kind: "lead", to: "backlog" });
    expect(sheetKey(key("B"), true, { leaders: { b: "backlog" } })).toEqual({ kind: "lead", to: "backlog" });
  });

  it("passes a key the leader does not name", () => {
    expect(sheetKey(key("z"), true, { leaders: { b: "backlog" } })).toEqual({ kind: "pass" });
    expect(sheetKey(key("z"), true)).toEqual({ kind: "pass" });
  });

  it("does nothing while a modifier is held, you type, or the sheet is blocked", () => {
    expect(sheetKey(key("a", { meta: true }), false)).toEqual({ kind: "pass" });
    expect(sheetKey(key("a", { ctrl: true }), false)).toEqual({ kind: "pass" });
    expect(sheetKey(key("a", { alt: true }), false)).toEqual({ kind: "pass" });
    expect(sheetKey(key("a", { typing: true }), false)).toEqual({ kind: "pass" });
    expect(sheetKey(key("a", { blocked: true }), false)).toEqual({ kind: "pass" });
  });

  it("does nothing while leading either", () => {
    const options = { leaders: { b: "backlog" } };
    expect(sheetKey(key("b", { meta: true }), true, options)).toEqual({ kind: "pass" });
    expect(sheetKey(key("b", { ctrl: true }), true, options)).toEqual({ kind: "pass" });
    expect(sheetKey(key("b", { alt: true }), true, options)).toEqual({ kind: "pass" });
    expect(sheetKey(key("b", { typing: true }), true, options)).toEqual({ kind: "pass" });
    expect(sheetKey(key("b", { blocked: true }), true, options)).toEqual({ kind: "pass" });
  });

  it("has default options when it is given none", () => {
    expect(sheetKey(key("a"), false)).toEqual({ kind: "search", text: "a" });
  });
});
