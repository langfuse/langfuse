import { config } from "dotenv";
import { defineConfig } from "vitest/config";

// Load the shared worker env first, then let test-specific overrides win.
config({ path: "../.env" });
config({ path: "../.env.test", override: true });

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
