import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    dir: "./src",
    include: ["**/*.test.ts"],
    pool: "forks",
  },
});
