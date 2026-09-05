import { defineConfig } from "vitest/config";
import { ciVitestCache } from "../../scripts/vitest/transform-cache.mjs";

export default defineConfig({
  test: {
    experimental: ciVitestCache("shared"),
    silent: "passed-only",
    dir: "./src",
    include: ["**/*.test.ts"],
    pool: "forks",
    server: {
      deps: {
        // Process the Vertex provider through vite so vi.mock can replace its
        // google-auth-library import (externalized deps bypass the mock
        // registry) — required by the AI SDK request-shape tests.
        inline: ["@ai-sdk/google-vertex"],
      },
    },
  },
});
