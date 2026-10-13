// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IdTailCell, idTailColumn } from "../columns/idTail.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("IdTailCell", () => {
  it("renders the last N characters of the id by default", () => {
    render(<IdTailCell id="abcdef-12345" />);
    expect(screen.getByText("…12345")).toBeDefined();
  });

  it("copies the full id to the clipboard on click", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: write } });
    render(<IdTailCell id="abcdef-12345" />);
    const button = screen.getByRole("button");
    button.click();
    expect(write).toHaveBeenCalledWith("abcdef-12345");
  });
});

describe("idTailColumn", () => {
  it("produces a ColumnDef-shaped object with an id, accessor, and cell", () => {
    interface Row {
      id: string;
    }
    const col = idTailColumn<Row>();
    expect(col.id).toBe("id");
    expect(col.accessorKey).toBe("id");
    expect(typeof col.cell).toBe("function");
  });
});
