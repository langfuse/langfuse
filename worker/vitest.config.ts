import { config } from "dotenv";
import { defineConfig } from "vitest/config";

// Load ../.env to match the CLI: dotenv -e ../.env
config({ path: "../.env" });

export default defineConfig({
  test: {
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    server: {
      deps: {
        inline: ["@langfuse/shared"],
      },
    },
  },
});
