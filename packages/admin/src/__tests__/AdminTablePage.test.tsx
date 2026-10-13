// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AdminTablePage, type ResourceQueryResult } from "../client/AdminTablePage.js";
import { IdTailCell, timestampColumn, idTailColumn } from "../columns/index.js";
import type { ColumnDef } from "@tanstack/react-table";

interface Row {
  id: string;
  email: string;
  createdAt: Date;
}

function makeColumns(): ColumnDef<Row>[] {
  return [
    idTailColumn<Row>(),
    {
      id: "email",
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) => <span>{row.original.email}</span>,
    },
    timestampColumn<Row>({ field: "createdAt", label: "Created" }),
  ];
}

function makeQuery(overrides: Partial<ResourceQueryResult<Row>> = {}) {
  const fn = vi.fn(
    (): ResourceQueryResult<Row> => ({
      rows: [
        { id: "abcdef", email: "a@example.com", createdAt: new Date() },
        { id: "xyz123", email: "b@example.com", createdAt: new Date() },
      ],
      total: 2,
      isLoading: false,
      error: null,
      ...overrides,
    }),
  );
  return fn;
}

describe("AdminTablePage", () => {
  it("renders the title, banner, and one row per resource", () => {
    render(
      <AdminTablePage
        title="Users Admin"
        resource="users"
        session={{ email: "founder@example.com", isSuperAdmin: true }}
        columns={makeColumns()}
        useResourceQuery={makeQuery()}
      />,
    );
    expect(screen.getByRole("heading", { name: "Users Admin" })).toBeDefined();
    expect(screen.getByText("2 of 2 users")).toBeDefined();
    expect(screen.getByText("a@example.com")).toBeDefined();
    expect(screen.getByText("b@example.com")).toBeDefined();
  });

  it("shows the loading spinner when the query is loading", () => {
    render(
      <AdminTablePage
        title="Users"
        resource="users"
        session={null}
        columns={makeColumns()}
        useResourceQuery={makeQuery({ isLoading: true, rows: [], total: 0 })}
      />,
    );
    expect(screen.getByLabelText("loading")).toBeDefined();
  });

  it("renders an error message when the query returns one", () => {
    render(
      <AdminTablePage
        title="Users"
        resource="users"
        session={null}
        columns={makeColumns()}
        useResourceQuery={makeQuery({
          error: { message: "network down" },
          rows: [],
          total: 0,
        })}
      />,
    );
    expect(screen.getByText(/Error loading users: network down/)).toBeDefined();
  });

  it("renders the empty state when there are no rows", () => {
    render(
      <AdminTablePage
        title="Users"
        resource="users"
        session={null}
        columns={makeColumns()}
        useResourceQuery={makeQuery({ rows: [], total: 0 })}
      />,
    );
    expect(screen.getByText(/No users match/)).toBeDefined();
  });

  it("calls the resource query with the right pagination args", () => {
    const query = makeQuery();
    render(
      <AdminTablePage
        title="Users"
        resource="users"
        session={null}
        columns={makeColumns()}
        useResourceQuery={query}
        itemsPerPage={5}
      />,
    );
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 5,
        searchTerm: "",
        sort: "createdAt desc",
      }),
    );
  });

  it("advances the page when Next is clicked", async () => {
    const user = userEvent.setup();
    const query = makeQuery({ total: 25 });
    render(
      <AdminTablePage
        title="Users"
        resource="users"
        session={null}
        columns={makeColumns()}
        useResourceQuery={query}
        itemsPerPage={10}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Next/ }));
    expect(query).toHaveBeenLastCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
  });

  it("keeps the banner slot open for a custom banner", () => {
    render(
      <AdminTablePage
        title="Users"
        resource="users"
        session={{ email: "x@y.com" }}
        columns={makeColumns()}
        useResourceQuery={makeQuery()}
        banner={<div data-testid="custom-banner">custom</div>}
      />,
    );
    expect(screen.getByTestId("custom-banner")).toBeDefined();
  });
});
