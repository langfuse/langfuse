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
    retry: process.env.CI ? 3 : 0,
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
