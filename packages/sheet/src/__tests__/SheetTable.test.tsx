// @vitest-environment jsdom
// The sheet kit's table: any rows as a sheet — numbered, searched by typing, filtered and sorted from its headers,
// with its sort and filters kept under its storage key, and a line that says why it's empty.

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BLANK, type SheetSpec } from "../sheet.js";
import { SheetTable, type SheetTableProps } from "../client/SheetTable.js";

interface Pet {
  id: string;
  name: string;
  kind: string | null;
  age: number;
}
type Key = "name" | "kind" | "age";

const SPEC: SheetSpec<Pet, Key> = {
  search: { key: "name", text: (p) => p.name, placeholder: "Type a name…", hint: "Words in the name", noun: ["pet", "pets"] },
  columns: [
    { key: "name", label: "Name", values: (p) => [p.name] },
    { key: "kind", label: "Kind", filter: true, values: (p) => [p.kind ?? BLANK] },
    { key: "age", label: "Age", flip: true, right: true, values: (p) => [String(p.age)], number: (p) => p.age },
  ],
};
const PETS: Pet[] = [
  { id: "1", name: "Rex", kind: "dog", age: 7 },
  { id: "2", name: "Tom", kind: "cat", age: 3 },
  { id: "3", name: "Polly", kind: null, age: 12 },
];

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function setup(over: Partial<SheetTableProps<Pet, Key>> = {}) {
  const props: SheetTableProps<Pet, Key> = {
    spec: SPEC,
    rows: PETS,
    rowKey: (p) => p.id,
    cells: { name: (p) => <b>{p.name}</b> },
    widths: ["1fr", "1fr", "60px"],
    storageKey: "test:pets",
    onRowClick: vi.fn(),
    ...over,
  };
  return { props, view: render(<SheetTable {...props} />) };
}
const names = (container: HTMLElement) => [...container.querySelectorAll(".sheet-table-row b")].map((b) => b.textContent);

describe("SheetTable", () => {
  it("numbers its rows, draws a column's own cell or its values, and opens a row on a click or Enter", () => {
    const { view, props } = setup();
    expect(names(view.container)).toEqual(["Rex", "Tom", "Polly"]);
    expect([...view.container.querySelectorAll(".sheet-table-row .sheet-gutter")].map((g) => g.textContent)).toEqual(["1", "2", "3"]);
    expect(view.getByText("dog")).toBeInTheDocument();
    fireEvent.click(view.getByText("Tom"));
    fireEvent.keyDown(view.getByText("Rex").closest("[role=button]") as Element, { key: "Enter" });
    expect(props.onRowClick).toHaveBeenCalledTimes(2);
  });

  it("searches as you type anywhere, in the search column's menu", () => {
    const { view } = setup();
    fireEvent.keyDown(document.body, { key: "p" });
    const box = view.getByPlaceholderText("Type a name…");
    expect(box).toHaveValue("p");
    expect(names(view.container)).toEqual(["Polly"]);
    expect(view.getByText("1 pet matches")).toBeInTheDocument();
  });

  it("filters by values from a header, and the corner clears it", () => {
    const { view } = setup();
    fireEvent.click(view.getByTitle(/Filter or sort by kind/));
    fireEvent.click(view.getByRole("checkbox", { name: "dog" }));
    expect(names(view.container)).toEqual(["Tom", "Polly"]);
    fireEvent.click(view.getByLabelText("Clear filters"));
    expect(names(view.container)).toEqual(["Rex", "Tom", "Polly"]);
  });

  it("flips a number column's sort on a click and keeps it under its storage key", () => {
    const { view } = setup();
    fireEvent.click(view.getByTitle(/Sort by age/));
    expect(names(view.container)).toEqual(["Tom", "Rex", "Polly"]);
    fireEvent.click(view.getByTitle(/Sort by age/));
    expect(names(view.container)).toEqual(["Polly", "Rex", "Tom"]);
    expect(JSON.parse(window.localStorage.getItem("test:pets") ?? "{}")).toMatchObject({ sort: { key: "age", dir: "desc" } });
  });

  it("starts from its fresh sheet", () => {
    const { view } = setup({ fresh: { sort: { key: "age", dir: "asc" }, hidden: {}, query: "", collapsed: [] } });
    expect(names(view.container)).toEqual(["Tom", "Rex", "Polly"]);
  });

  it("says why it's empty: an error, loading, nothing yet, or nothing matching", () => {
    expect(setup({ rows: [], error: "boom" }).view.getByText("boom")).toBeInTheDocument();
    cleanup();
    expect(setup({ rows: [], loading: true }).view.getByText("Loading…")).toBeInTheDocument();
    cleanup();
    expect(setup({ rows: [], empty: "No pets." }).view.getByText("No pets.")).toBeInTheDocument();
    cleanup();
    const { view } = setup();
    fireEvent.keyDown(document.body, { key: "z" });
    expect(view.getByText("Nothing matches these filters.")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(view.getByText("Clear filters"));
    expect(names(view.container)).toHaveLength(3);
  });
});
