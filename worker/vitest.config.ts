import { config } from "dotenv";
import { defineConfig } from "vitest/config";

// Load ../.env so direct Vitest runs and package scripts use the same worker env.
config({ path: "../.env" });

export default defineConfig({
  test: {
    dir: "./src",
    pool: "forks",
    maxWorkers: 1,
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
