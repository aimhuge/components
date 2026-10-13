// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { formatDistanceToNow } from "date-fns";
import { describe, expect, it } from "vitest";

import { timestampColumn } from "../columns/timestampColumn.js";

interface Row {
  id: string;
  createdAt: Date | null;
  deletedAt: string | null;
}

function renderCell(value: Row[keyof Row]) {
  const col = timestampColumn<Row>({
    field: "createdAt",
    label: "Created",
  });
  // `cell` is a function on the column def; we feed it a row with the
  // given value and read its output.
  const fakeRow = {
    original: {
      id: "r1",
      createdAt: value as Date | null,
      deletedAt: null,
    } satisfies Row,
  };
  // @ts-expect-error - the cell signature uses a real TanStack row; we
  // pass a structural fake because we only call the function with row.original.
  return col.cell({ row: fakeRow });
}

describe("timestampColumn", () => {
  it("renders a 'N ago' string for a real date", () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60_000);
    const node = renderCell(tenMinAgo) as React.ReactElement<{ title: string; children: React.ReactNode }>;
    const { container } = render(node);
    expect(container.textContent).toContain("ago");
    expect(container.textContent).toContain(formatDistanceToNow(tenMinAgo));
  });

  it("renders the placeholder for null", () => {
    const node = renderCell(null) as React.ReactElement<{ children: React.ReactNode }>;
    const { container } = render(node);
    expect(container.textContent).toBe("—");
  });

  it("uses the supplied placeholder text", () => {
    const col = timestampColumn<Row>({
      field: "createdAt",
      label: "Created",
      placeholder: "active",
      showPlaceholderWhenMissing: true,
    });
    const fakeRow = { original: { id: "r1", createdAt: null, deletedAt: null } satisfies Row };
    // @ts-expect-error - structural fake for the cell renderer
    const node = col.cell({ row: fakeRow }) as React.ReactElement<{ children: React.ReactNode }>;
    const { container } = render(node);
    expect(container.textContent).toBe("active");
  });

  it("renders nothing when showPlaceholderWhenMissing is false", () => {
    const col = timestampColumn<Row>({
      field: "createdAt",
      label: "Created",
      placeholder: "active",
      showPlaceholderWhenMissing: false,
    });
    const fakeRow = { original: { id: "r1", createdAt: null, deletedAt: null } satisfies Row };
    // @ts-expect-error - structural fake
    const node = col.cell({ row: fakeRow });
    const { container } = render(<>{node as React.ReactNode}</>);
    expect(container.textContent).toBe("");
  });
});
