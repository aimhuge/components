import { describe, expect, it } from "vitest";
import {
  BLANK,
  columnOf,
  compareValues,
  filterCountOf,
  flipSortOf,
  keepOnlyOf,
  nextSortOf,
  parseSheet,
  rowPasses,
  sortItems,
  sortRows,
  toggleHiddenOf,
  toggleIn,
  valueCountsOf,
  type SheetColumn,
  type SheetSpec,
  type SheetStateOf,
} from "../sheet.js";

// A small row type for the sheet kit: a name, some tags, an age that may be missing, and a pipeline stage.
interface Row {
  name: string;
  tags: string[];
  age: number | null;
  stage: string;
}

type Key = "name" | "tags" | "stage" | "age";

// The stages go in this order, not A→Z.
const STAGE_ORDER = ["plan", "build", "ship"];

function stageRank(value: string) {
  const i = STAGE_ORDER.indexOf(value);
  return i < 0 ? STAGE_ORDER.length : i;
}

const COLUMNS: SheetColumn<Row, Key>[] = [
  { key: "name", label: "Name", values: (row) => [row.name] },
  { key: "tags", label: "Tags", filter: true, values: (row) => (row.tags.length ? row.tags : [BLANK]) },
  { key: "stage", label: "Stage", filter: true, values: (row) => [row.stage], rank: stageRank },
  {
    key: "age",
    label: "Age",
    filter: true,
    flip: true,
    values: (row) => [row.age === null ? BLANK : String(row.age)],
    number: (row) => row.age,
  },
];

const SPEC: SheetSpec<Row, Key> = {
  columns: COLUMNS,
  search: { key: "name", text: (row) => row.name, placeholder: "Search", hint: "Every word", noun: ["row", "rows"] },
};

const NOW = 1_800_000_000_000;

function row(overrides: Partial<Row> = {}): Row {
  return { name: "row", tags: [], age: 0, stage: "plan", ...overrides };
}

const names = (rows: Row[]) => rows.map((r) => r.name);

// The column a test needs, found by key — the spec is fixed, so a miss is a broken test.
function column(key: Key): SheetColumn<Row, Key> {
  const found = columnOf(SPEC, key);
  if (!found) throw new Error(`no column ${key}`);
  return found;
}

// The rows sorted by a column, by name.
function sorted(rows: Row[], key: Key, dir: "asc" | "desc") {
  return names(sortItems(rows, (r) => r, SPEC, { key, dir }, NOW));
}

describe("columnOf", () => {
  it("finds a column by its key, and nothing for a missing one", () => {
    expect(columnOf(SPEC, "name")?.label).toBe("Name");
    expect(columnOf(SPEC, "tags")?.label).toBe("Tags");
    expect(columnOf(SPEC, "age")?.label).toBe("Age");
    expect(columnOf(SPEC, "nope" as Key)).toBeUndefined();
    expect(columnOf(SPEC, undefined)).toBeUndefined();
  });
});

describe("compareValues", () => {
  it("orders text A→Z, naturally for numbers in the text", () => {
    const name = column("name");
    expect(compareValues(name, "a", "b")).toBeLessThan(0);
    expect(compareValues(name, "b", "a")).toBeGreaterThan(0);
    expect(compareValues(name, "a", "a")).toBe(0);
    // Natural order: "item 2" before "item 10", not after it.
    expect(compareValues(name, "item 2", "item 10")).toBeLessThan(0);
  });

  it("orders by the column's rank first, and falls back to the text for equal ranks", () => {
    const stage = column("stage");
    expect(compareValues(stage, "build", "ship")).toBeLessThan(0);
    expect(compareValues(stage, "ship", "build")).toBeGreaterThan(0);
    // Two values the rank doesn't know share the last rank, so they fall back to the text.
    expect(compareValues(stage, "zeta", "alpha")).toBeGreaterThan(0);
    expect(compareValues(stage, "alpha", "zeta")).toBeLessThan(0);
    expect(compareValues(stage, "mystery", "other")).toBeLessThan(0);
  });
});

describe("sortItems", () => {
  it("gives back the same array with no sort, or a sort key the spec doesn't have", () => {
    const rows = [row({ name: "b" }), row({ name: "a" })];
    expect(sortItems(rows, (r) => r, SPEC, null, NOW)).toBe(rows);
    expect(sortItems(rows, (r) => r, SPEC, { key: "nope" as Key, dir: "asc" }, NOW)).toBe(rows);
  });

  it("sorts text A→Z and Z→A, with natural numbers in the text", () => {
    const rows = [row({ name: "item 10" }), row({ name: "item 2" })];
    expect(sorted(rows, "name", "asc")).toEqual(["item 2", "item 10"]);
    expect(sorted(rows, "name", "desc")).toEqual(["item 10", "item 2"]);
  });

  it("sorts a row with several values by them in turn, as one string", () => {
    const rows = [row({ name: "b", tags: ["zeta", "alpha"] }), row({ name: "a", tags: ["beta"] })];
    expect(sorted(rows, "tags", "asc")).toEqual(["a", "b"]);
    expect(sorted(rows, "tags", "desc")).toEqual(["b", "a"]);
  });

  it("sorts by a column's rank, not A→Z", () => {
    const rows = [row({ name: "ship", stage: "ship" }), row({ name: "plan", stage: "plan" }), row({ name: "build", stage: "build" })];
    expect(sorted(rows, "stage", "asc")).toEqual(["plan", "build", "ship"]);
    expect(sorted(rows, "stage", "desc")).toEqual(["ship", "build", "plan"]);
  });

  it("sorts numbers numerically, not lexically", () => {
    const rows = [row({ name: "ten", age: 10 }), row({ name: "nine", age: 9 })];
    // Lexically "10" would come before "9"; numerically it doesn't.
    expect(sorted(rows, "age", "asc")).toEqual(["nine", "ten"]);
    expect(sorted(rows, "age", "desc")).toEqual(["ten", "nine"]);
  });

  it("keeps a tie in the items' own order", () => {
    const rows = [row({ name: "first", age: 5 }), row({ name: "second", age: 5 }), row({ name: "third", age: 5 })];
    expect(sorted(rows, "age", "asc")).toEqual(["first", "second", "third"]);
    expect(sorted(rows, "age", "desc")).toEqual(["first", "second", "third"]);
  });

  it("keeps blanks at the bottom both ways, for a missing number and for blank values", () => {
    const rows = [row({ name: "blank", age: null }), row({ name: "ten", age: 10 }), row({ name: "nine", age: 9 })];
    expect(sorted(rows, "age", "asc")).toEqual(["nine", "ten", "blank"]);
    expect(sorted(rows, "age", "desc")).toEqual(["ten", "nine", "blank"]);
    const tags = [row({ name: "blank", tags: [] }), row({ name: "tagged", tags: ["alpha"] })];
    expect(sorted(tags, "tags", "asc")).toEqual(["tagged", "blank"]);
    expect(sorted(tags, "tags", "desc")).toEqual(["tagged", "blank"]);
  });

  it("keeps several blanks at the bottom, whichever order they come in", () => {
    const rows = [
      row({ name: "blankOne", age: null }),
      row({ name: "one", age: 1 }),
      row({ name: "blankTwo", age: null }),
      row({ name: "two", age: 2 }),
      row({ name: "blankThree", age: null }),
      row({ name: "three", age: 3 }),
    ];
    expect(sorted(rows, "age", "asc")).toEqual(["one", "two", "three", "blankOne", "blankTwo", "blankThree"]);
    expect(sorted(rows, "age", "desc")).toEqual(["three", "two", "one", "blankOne", "blankTwo", "blankThree"]);
  });


  it("keeps the blanks of a blank-only column at the bottom too", () => {
    const rows = [row({ name: "blankOne", tags: [] }), row({ name: "one", tags: ["alpha"] }), row({ name: "blankTwo", tags: [] })];
    expect(sorted(rows, "tags", "asc")).toEqual(["one", "blankOne", "blankTwo"]);
    expect(sorted(rows, "tags", "desc")).toEqual(["one", "blankOne", "blankTwo"]);
  });

  it("sorts rows by a column through sortRows, and leaves them alone with no sort", () => {
    const rows = [row({ name: "b" }), row({ name: "a" })];
    expect(sortRows(rows, SPEC, null, NOW)).toBe(rows);
    expect(names(sortRows(rows, SPEC, { key: "name", dir: "asc" }, NOW))).toEqual(["a", "b"]);
    expect(names(sortRows(rows, SPEC, { key: "name", dir: "desc" }, NOW))).toEqual(["b", "a"]);
  });
});


describe("rowPasses", () => {
  it("keeps everything with an empty or whitespace-only query", () => {
    const r = row({ name: "Alpha" });
    expect(rowPasses(r, SPEC, {}, "", NOW)).toBe(true);
    expect(rowPasses(r, SPEC, {}, "   ", NOW)).toBe(true);
  });

  it("matches the search column's text on every query word", () => {
    const r = row({ name: "Alpha beta" });
    expect(rowPasses(r, SPEC, {}, "alpha", NOW)).toBe(true);
    expect(rowPasses(r, SPEC, {}, "alpha beta", NOW)).toBe(true);
    expect(rowPasses(r, SPEC, {}, "alpha gamma", NOW)).toBe(false);
  });

  it("ignores a filter whose hidden list is empty", () => {
    expect(rowPasses(row({ name: "a", tags: ["bug"] }), SPEC, { tags: [] }, "", NOW)).toBe(true);
  });

  it("hides a row only when every value it has is unticked", () => {
    const one = row({ name: "one", tags: ["bug"] });
    const two = row({ name: "two", tags: ["bug", "ui"] });
    expect(rowPasses(one, SPEC, { tags: ["bug"] }, "", NOW)).toBe(false);
    expect(rowPasses(two, SPEC, { tags: ["bug"] }, "", NOW)).toBe(true);
    // Unticking a value the row doesn't have leaves it showing.
    expect(rowPasses(one, SPEC, { tags: ["ui"] }, "", NOW)).toBe(true);
  });
});

describe("valueCountsOf", () => {
  // The counts as "value×count" strings, so an expectation reads as a list.
  const counts = (rows: Row[], key: Key) => valueCountsOf(rows, column(key), NOW).map((c) => `${c.value}×${c.count}`);

  it("counts each value once per row", () => {
    const rows = [row({ tags: ["bug", "ui"] }), row({ tags: ["bug"] }), row({ tags: ["bug", "bug"] })];
    expect(counts(rows, "tags")).toEqual(["bug×3", "ui×1"]);
  });

  it("orders the values by the column's order, and puts blanks last", () => {
    expect(counts([row({ stage: "ship" }), row({ stage: "plan" })], "stage")).toEqual(["plan×1", "ship×1"]);
    expect(counts([row({ tags: [] }), row({ tags: ["alpha"] })], "tags")).toEqual(["alpha×1", `${BLANK}×1`]);
  });

  it("puts the blank last among several values, whatever order they come in", () => {
    const rows = [
      row({ tags: [] }),
      row({ tags: ["alpha"] }),
      row({ tags: [] }),
      row({ tags: ["beta"] }),
      row({ tags: ["gamma"] }),
      row({ tags: [] }),
    ];
    expect(counts(rows, "tags")).toEqual(["alpha×1", "beta×1", "gamma×1", `${BLANK}×3`]);
  });

  it("puts the blank last when the blank is the column's first value", () => {
    const rows = [row({ tags: [] }), row({ tags: ["alpha"] }), row({ tags: ["beta"] })];
    expect(counts(rows, "tags")).toEqual(["alpha×1", "beta×1", `${BLANK}×1`]);
  });

  it("puts the blank last when the blank is the column's last value", () => {
    const rows = [row({ tags: ["alpha"] }), row({ tags: ["beta"] }), row({ tags: ["gamma"] }), row({ tags: [] })];
    expect(counts(rows, "tags")).toEqual(["alpha×1", "beta×1", "gamma×1", `${BLANK}×1`]);
  });
});

describe("nextSortOf, flipSortOf, toggleHiddenOf, keepOnlyOf, toggleIn and filterCountOf", () => {
  it("cycles a header A→Z, Z→A, off, and starts a new column at A→Z", () => {
    expect(nextSortOf(null, "name")).toEqual({ key: "name", dir: "asc" });
    expect(nextSortOf({ key: "name", dir: "asc" }, "name")).toEqual({ key: "name", dir: "desc" });
    expect(nextSortOf({ key: "name", dir: "desc" }, "name")).toBeNull();
    expect(nextSortOf({ key: "name", dir: "desc" }, "age")).toEqual({ key: "age", dir: "asc" });
  });

  it("flips a number column's sort between ascending and descending", () => {
    expect(flipSortOf(null, "age")).toEqual({ key: "age", dir: "asc" });
    expect(flipSortOf({ key: "age", dir: "asc" }, "age")).toEqual({ key: "age", dir: "desc" });
    expect(flipSortOf({ key: "age", dir: "desc" }, "age")).toEqual({ key: "age", dir: "asc" });
    expect(flipSortOf({ key: "name", dir: "asc" }, "age")).toEqual({ key: "age", dir: "asc" });
  });

  it("ticks a value, then unticks it, leaving the other columns alone", () => {
    const once = toggleHiddenOf<Key>({ stage: ["plan"] }, "tags", "bug");
    expect(once).toEqual({ stage: ["plan"], tags: ["bug"] });
    expect(toggleHiddenOf(once, "tags", "bug")).toEqual({ stage: ["plan"], tags: [] });
  });

  it("keeps only the given values ticked, and clears the column when none are kept", () => {
    expect(keepOnlyOf({}, "tags", ["bug", "ui"], ["bug"])).toEqual({ tags: ["ui"] });
    expect(keepOnlyOf<Key>({ stage: ["plan"] }, "tags", ["bug"], [])).toEqual({ stage: ["plan"], tags: [] });
  });

  it("adds an item to a list, and takes it out again", () => {
    expect(toggleIn([], "backlog")).toEqual(["backlog"]);
    expect(toggleIn(["backlog"], "backlog")).toEqual([]);
    expect(toggleIn(["a"], "b")).toEqual(["a", "b"]);
  });

  it("counts the filtered columns and the search", () => {
    expect(filterCountOf({ tags: ["bug"], stage: [], age: ["Older"] })).toBe(2);
    expect(filterCountOf({}, "")).toBe(0);
    expect(filterCountOf({}, "  ")).toBe(0);
    expect(filterCountOf({}, "bug")).toBe(1);
    expect(filterCountOf({ tags: ["bug"] }, "bug")).toBe(2);
  });
});

describe("parseSheet", () => {
  const FRESH: SheetStateOf<Key, "plan" | "build"> = { sort: null, hidden: {}, query: "", collapsed: ["plan"] };
  const KEYS: Key[] = ["name", "tags", "stage", "age"];
  const BANDS = ["plan", "build"] as const;
  const read = (saved: unknown) => parseSheet(JSON.stringify(saved), KEYS, BANDS, FRESH);

  it("gives the fresh sheet itself for nothing to read, and for unreadable JSON", () => {
    expect(parseSheet(null, KEYS, BANDS, FRESH)).toBe(FRESH);
    expect(parseSheet("{bad", KEYS, BANDS, FRESH)).toBe(FRESH);
  });

  it("keeps what it knows and drops what it doesn't", () => {
    const saved = {
      sort: { key: "age", dir: "desc" },
      hidden: { tags: ["bug", 3], stage: "x", nope: ["x"] },
      query: "needle",
      collapsed: ["build", "nope"],
    };
    expect(read(saved)).toEqual({
      sort: { key: "age", dir: "desc" },
      hidden: { tags: ["bug"] },
      query: "needle",
      collapsed: ["build"],
    });
  });

  it("has no sort for an unknown key or a direction it doesn't know", () => {
    expect(read({ sort: { key: "nope", dir: "asc" } }).sort).toBeNull();
    expect(read({ sort: { key: "age", dir: "up" } }).sort).toBeNull();
    expect(read({ sort: null }).sort).toBeNull();
    expect(read({}).sort).toBeNull();
  });

  it("has an empty query when the saved one isn't text, and the fresh folds when they aren't a list", () => {
    expect(read({ query: 42 }).query).toBe("");
    expect(read({ collapsed: "build" }).collapsed).toEqual(["plan"]);
  });
});
