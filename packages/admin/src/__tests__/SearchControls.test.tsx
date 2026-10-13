// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SearchControls } from "../client/SearchControls.js";

describe("SearchControls", () => {
  it("renders the page counter and a search input", () => {
    render(
      <SearchControls
        searchTerm=""
        onSearchChange={() => {}}
        currentPage={2}
        totalPages={5}
      />,
    );
    expect(screen.getByText("Page 2 of 5")).toBeDefined();
    expect(screen.getByPlaceholderText("Search…")).toBeDefined();
  });

  it("forwards input changes to onSearchChange", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    render(
      <SearchControls
        searchTerm=""
        onSearchChange={onSearchChange}
        currentPage={1}
        totalPages={1}
      />,
    );
    const input = screen.getByPlaceholderText("Search…");
    await user.type(input, "a");
    expect(onSearchChange).toHaveBeenCalledWith("a");
  });

  it("shows the loading hint when isLoading is true", () => {
    render(
      <SearchControls
        searchTerm=""
        onSearchChange={() => {}}
        currentPage={1}
        totalPages={3}
        isLoading
      />,
    );
    expect(screen.getByText(/loading/)).toBeDefined();
  });
});
