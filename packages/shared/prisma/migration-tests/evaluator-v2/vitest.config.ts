import { defineConfig } from "vitest/config";

export default defineConfig({
  root: __dirname,
  test: {
    environment: "node",
    hookTimeout: 3_600_000,
    include: ["migration.test.ts"],
    pool: "forks",
    testTimeout: 30_000,
  },
});
