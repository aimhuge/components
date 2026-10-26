import { describe, expect, it } from "vitest";
import { matchRank, matches, stepHighlight, typeahead } from "../typeahead.js";

describe("matchRank", () => {
  it("ranks a start, a word start and an anywhere match", () => {
    expect(matchRank("Alpha beta", "alpha")).toBe(0);
    expect(matchRank("Alpha beta", "beta")).toBe(1);
    expect(matchRank("xAlphabet", "alpha")).toBe(2);
  });

  it("treats every word as needing to appear, and sums their ranks", () => {
    expect(matchRank("alpha beta", "alpha beta")).toBe(1);
    expect(matchRank("alpha beta", "beta alpha")).toBe(1);
    expect(matchRank("alpha beta", "alpha missing")).toBeNull();
  });

  it("matches everything with an empty query and nothing when a word is missing", () => {
    expect(matchRank("anything", "")).toBe(0);
    expect(matchRank("anything", "   ")).toBe(0);
    expect(matchRank("alpha", "omega")).toBeNull();
  });
});

describe("matches", () => {
  it("says whether the text contains every query word", () => {
    expect(matches("Alpha beta", "alpha")).toBe(true);
    expect(matches("Alpha beta", "alpha gamma")).toBe(false);
    expect(matches("Alpha beta", "")).toBe(true);
  });
});

describe("typeahead", () => {
  it("returns every item in its own order with an empty query", () => {
    const items = ["one", "two", "three"];
    expect(typeahead(items, "", (x) => x)).toBe(items);
    expect(typeahead(items, "  ", (x) => x)).toBe(items);
  });

  it("orders by rank, then length, then original order, and drops misses", () => {
    const items = [
      { text: "prefix alpha" },
      { text: "xalphabet" },
      { text: "word alpha here" },
      { text: "nothing" },
      { text: "alpha" },
    ];
    expect(typeahead(items, "alpha", (x) => x.text).map((x) => x.text)).toEqual([
      "alpha",
      "prefix alpha",
      "word alpha here",
      "xalphabet",
    ]);
  });

  it("keeps equal-rank, equal-length items in their original order", () => {
    const items = ["x alpha y", "z alpha w"];
    expect(typeahead(items, "alpha", (x) => x)).toEqual(items);
  });
});

describe("stepHighlight", () => {
  it("has no highlight in an empty list", () => {
    expect(stepHighlight(0, 0, "ArrowDown")).toBe(-1);
    expect(stepHighlight(2, 0, "ArrowUp")).toBe(-1);
  });

  it("moves down and wraps at the end", () => {
    expect(stepHighlight(-1, 3, "ArrowDown")).toBe(0);
    expect(stepHighlight(0, 3, "ArrowDown")).toBe(1);
    expect(stepHighlight(2, 3, "ArrowDown")).toBe(0);
  });

  it("moves up and wraps at the start", () => {
    expect(stepHighlight(0, 3, "ArrowUp")).toBe(2);
    expect(stepHighlight(2, 3, "ArrowUp")).toBe(1);
    expect(stepHighlight(-1, 3, "ArrowUp")).toBe(2);
  });

  it("keeps the position for other keys", () => {
    expect(stepHighlight(1, 3, "Enter")).toBe(1);
    expect(stepHighlight(-1, 3, "Escape")).toBe(-1);
  });
});
