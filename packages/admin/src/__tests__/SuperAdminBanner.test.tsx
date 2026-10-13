// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SuperAdminBanner } from "../client/SuperAdminBanner.js";

describe("SuperAdminBanner", () => {
  it("renders all provided fields", () => {
    render(
      <SuperAdminBanner
        session={{
          id: "user_123456",
          name: "Pat Founder",
          email: "pat@example.com",
          teamSlug: "acme",
          teamId: "team_654321",
          isSuperAdmin: true,
        }}
      />,
    );
    expect(screen.getByText("Pat Founder")).toBeDefined();
    expect(screen.getByText("pat@example.com")).toBeDefined();
    // The UserId is shown as the last 5 chars of the id.
    expect(screen.getByText("23456")).toBeDefined();
    expect(screen.getByText("acme")).toBeDefined();
    // TeamId is also shown truncated.
    expect(screen.getByText("54321")).toBeDefined();
  });

  it("shows a fallback when session is null", () => {
    render(<SuperAdminBanner session={null} />);
    expect(screen.getByText(/No session attached/i)).toBeDefined();
  });

  it("renders em-dashes for missing fields", () => {
    render(<SuperAdminBanner session={{}} />);
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });
});
