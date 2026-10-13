import { describe, expect, it } from "vitest";

import { nextSort, parseSort } from "../columns/sortableHeader.js";

describe("parseSort", () => {
  it("falls back to the default field and desc when sort is empty", () => {
    expect(parseSort(undefined, "createdAt")).toEqual({
      field: "createdAt",
      dir: "desc",
    });
  });

  it("parses 'field asc' correctly", () => {
    expect(parseSort("name asc", "createdAt")).toEqual({
      field: "name",
      dir: "asc",
    });
  });

  it("defaults to desc when the direction token is missing or unknown", () => {
    expect(parseSort("name", "createdAt")).toEqual({
      field: "name",
      dir: "desc",
    });
    expect(parseSort("name sideways", "createdAt")).toEqual({
      field: "name",
      dir: "desc",
    });
  });
});

describe("nextSort", () => {
  it("starts at desc when switching to a new field", () => {
    expect(nextSort("name asc", "createdAt")).toBe("createdAt desc");
  });

  it("flips asc to desc on the same field", () => {
    expect(nextSort("name asc", "name")).toBe("name desc");
  });

  it("flips desc to asc on the same field", () => {
    expect(nextSort("name desc", "name")).toBe("name asc");
  });

  it("starts at the requested default direction when there's no current sort", () => {
    expect(nextSort(undefined, "createdAt", "asc")).toBe("createdAt asc");
  });
});
