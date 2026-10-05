import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      // A Next build-time guard with no runtime module of its own; Next
      // aliases it in every app, so the tests stub it the same way.
      "server-only": fileURLToPath(new URL("./src/__tests__/server-only-stub.ts", import.meta.url)),
    },
  },
});
