import { describe, expect, it } from "vitest";
import {
  consequenceOf,
  gateLabels,
  gateOptionsFor,
  isShareMode,
  linkGrantsEdit,
  linkGrantsRead,
  modeHasGate,
  SHARE_MODES,
  toAxes,
  toMode,
  withAxis,
  type ShareAxes,
} from "../index.js";

/** The dialog shows three axes over a five-value enum. These tests pin the two
 *  properties that keep that safe: every stored mode survives a round trip, and
 *  no axis edit can widen access by accident. (Moved from DeckCP's
 *  shareAccessAxes.test.ts.) */

describe("modes", () => {
  it("knows which modes a bare link opens, writes or gates", () => {
    expect(SHARE_MODES.filter(linkGrantsRead)).toEqual(["public", "public_edit"]);
    expect(SHARE_MODES.filter(linkGrantsEdit)).toEqual(["public_edit"]);
    expect(SHARE_MODES.filter(modeHasGate)).toEqual(["email", "password"]);
  });

  it("recognises a stored mode and nothing else", () => {
    expect(isShareMode("email")).toBe(true);
    expect(isShareMode("team")).toBe(false);
    expect(isShareMode(null)).toBe(false);
  });
});

describe("toAxes / toMode round trip", () => {
  it("preserves every share mode", () => {
    for (const mode of SHARE_MODES) {
      for (const editRequiresEmail of [true, false]) {
        expect(toMode(toAxes(mode, editRequiresEmail)).mode).toBe(mode);
      }
    }
  });

  it("carries the link-edit email gate on the gate axis", () => {
    expect(toAxes("public_edit", true).gate).toBe("email");
    expect(toAxes("public_edit", false).gate).toBe("none");
    expect(toMode({ audience: "link", level: "edit", gate: "email" }).editRequiresEmail).toBe(true);
    expect(toMode({ audience: "link", level: "edit", gate: "none" }).editRequiresEmail).toBe(false);
  });

  it("keeps the edit gate on when private, so re-opening can't land on anonymous edits", () => {
    expect(toMode({ audience: "private", level: "edit", gate: "none" })).toEqual({
      mode: "private",
      editRequiresEmail: true,
    });
  });
});

describe("unrepresentable combinations", () => {
  it("never offers a password gate alongside editing", () => {
    expect(gateOptionsFor("edit")).not.toContain("password");
    expect(gateOptionsFor("view")).toContain("password");
  });

  it("falls back to the email gate when a password link is switched to editable", () => {
    const next = withAxis(toAxes("password", true), { level: "edit" });
    expect(next.gate).toBe("email");
    expect(toMode(next)).toEqual({ mode: "public_edit", editRequiresEmail: true });
  });
});

describe("withAxis defaults", () => {
  it("opens a private resource onto the email gate, not wide open", () => {
    expect(toMode(withAxis(toAxes("private", true), { audience: "link" })).mode).toBe("email");
  });

  it("leaves an already-shared resource's gate alone", () => {
    const open: ShareAxes = toAxes("public", true);
    expect(withAxis(open, { level: "view" }).gate).toBe("none");
  });

  it("honours an explicit gate choice made in the same edit", () => {
    expect(toMode(withAxis(toAxes("private", true), { audience: "link", gate: "none" })).mode).toBe("public");
  });
});

describe("copy", () => {
  it("names the shared thing in the gate labels", () => {
    expect(gateLabels("thread").none).toBe("Nothing — open the thread straight away");
  });

  it("says what a stranger with the link gets", () => {
    expect(consequenceOf(toAxes("private", true), "deck")).toMatch(/only works for you/);
    expect(consequenceOf(toAxes("public", true), "deck")).toBe(
      "Anyone who has the link opens the deck immediately — you won't know who they are.",
    );
    expect(consequenceOf(toAxes("email", true), "deck")).toBe("Anyone who has the link can give their email, then read the deck.");
    expect(consequenceOf(toAxes("password", true), "page")).toBe(
      "Anyone who has the link can enter the password, then read the page.",
    );
    expect(consequenceOf(toAxes("public_edit", false), "deck", "They can't delete it.")).toBe(
      "Anyone who has the link can change this deck. They can't delete it.",
    );
    expect(consequenceOf(toAxes("public_edit", true), "deck")).toBe("Anyone who has the link can give their email, then change this deck.");
  });
});
