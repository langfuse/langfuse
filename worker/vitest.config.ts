import { config } from "dotenv";
import { defineConfig } from "vitest/config";
import { VitestCiReporter } from "../scripts/vitest/ci-reporter";

// Load ../.env so direct Vitest runs and package scripts use the same worker env.
config({ path: "../.env" });

// Tests must not inherit a locally configured sandbox provider from ../.env
// (e.g. dangerous-docker). Sandbox enablement is owned solely by
// LANGFUSE_IN_APP_AGENT_SANDBOX_PROVIDER — unset it for the test process.
delete process.env.LANGFUSE_IN_APP_AGENT_SANDBOX_PROVIDER;

export default defineConfig({
  test: {
    reporters: process.env.CI
      ? ["default", new VitestCiReporter()]
      : ["default"],
    silent: "passed-only",
    retry: process.env.CI ? 3 : 0,
    // Worker tests are DB-roundtrip bound, so many cross the default 300ms
    // slow threshold on CI and the default reporter prints a line for each.
    // VitestCiReporter's top-10 slowest summary is unaffected (own accounting).
    slowTestThreshold: process.env.CI ? 2_000 : 300,
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
