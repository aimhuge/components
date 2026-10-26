import { defineConfig } from "vitest/config";

// Node by default; component specs opt into jsdom on their first line.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/__tests__/vitest.setup.ts"],
  },
});
