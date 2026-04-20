import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    globals: true,
    testTimeout: 30_000,
    server: {
      deps: {
        inline: [/@langfuse\//],
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "client",
          include: ["src/**/*.clienttest.{ts,tsx}"],
          environment: "jsdom",
          setupFiles: ["@testing-library/jest-dom/vitest"],
        },
      },
      {
        extends: true,
        test: {
          name: "server",
          include: ["src/**/server/**/*.servertest.{ts,tsx}"],
          exclude: ["src/__e2e__/**"],
          environment: "node",
          setupFiles: ["./src/__tests__/after-teardown.ts"],
          globalSetup: ["./src/__tests__/vitest-global-teardown.ts"],
          maxWorkers: 1,
        },
      },
      {
        extends: true,
        test: {
          name: "e2e-server",
          include: ["src/**/*.servertest.{ts,tsx}"],
          exclude: ["src/__tests__/**"],
          environment: "node",
          setupFiles: ["./src/__tests__/after-teardown.ts"],
          globalSetup: ["./src/__tests__/vitest-global-teardown.ts"],
          maxWorkers: 1,
        },
      },
    ],
  },
});
