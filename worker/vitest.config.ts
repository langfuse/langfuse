import { config } from "dotenv";
import { defineConfig } from "vitest/config";
import { VitestCiReporter } from "../scripts/vitest/ci-reporter";

// Load ../.env so direct Vitest runs and package scripts use the same worker env.
config({ path: "../.env" });

export default defineConfig({
  test: {
    reporters: process.env.CI
      ? ["default", new VitestCiReporter()]
      : ["default"],
    silent: "passed-only",
    // Worker tests are DB-roundtrip bound, so many cross the default 300ms
    // slow threshold on CI and the default reporter prints a line for each.
    // VitestCiReporter's top-10 slowest summary is unaffected (own accounting).
    slowTestThreshold: process.env.CI ? 2_000 : 300,
    // On a replicated ClickHouse cluster every lightweight DELETE waits until
    // all replicas applied it (lightweight_deletes_sync=2), about 1-2 s each,
    // and deletion tests issue several in sequence.
    testTimeout:
      process.env.CLICKHOUSE_CLUSTER_ENABLED === "true" ? 20_000 : undefined,
    dir: "./src",
    pool: "forks",
    server: {
      deps: {
        inline: ["@langfuse/shared"],
      },
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/__tests__/**", "src/scripts/**"],
    },
  },
});
