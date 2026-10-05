import { defineConfig } from "vitest/config";

// Node by default; the component specs opt into jsdom on their first line, the
// same per-file rule DeckCP uses (docs/architecture/testing-environments-and-ci.md).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
