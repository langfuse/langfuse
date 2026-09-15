import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    forceRerunTriggers: ["**/.vitest-force-full-run"],
    experimental: {
      vcsProvider: "../../scripts/vitest/shared-package-vcs-provider.ts",
    },
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
