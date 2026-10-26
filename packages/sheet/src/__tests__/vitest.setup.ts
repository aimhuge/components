// Vitest 4 / @testing-library/react 16 don't auto-cleanup between tests, and jest-dom's matchers
// (toBeInTheDocument, toHaveValue) are loaded once here for every component spec.
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
