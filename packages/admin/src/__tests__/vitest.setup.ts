// Vitest 4 / @testing-library/react 16 don't auto-cleanup between tests the
// way older combinations did. Without this, prior renders' DOM lingers and
// `getByText` matches across them. Vitest's docs recommend a global setup.
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
