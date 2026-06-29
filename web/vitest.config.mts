import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { VitestCiReporter } from "../scripts/vitest/ci-reporter";

const sharedExclude = [
  "**/node_modules/**",
  "**/.next/**",
  "**/.next-check/**",
  "**/dist/**",
];

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    reporters: process.env.CI
      ? ["default", new VitestCiReporter()]
      : ["default"],
    globals: true,
    retry: process.env.CI ? 3 : 0,
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
          name: "in-source",
          includeSource: ["./src/**/*.{ts,tsx}"],
          exclude: [
            ...sharedExclude,
            "src/**/*.clienttest.{ts,tsx}",
            "src/**/*.servertest.{ts,tsx}",
            "src/**/__tests__/**",
            "src/**/__e2e__/**",
          ],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "client",
          include: ["src/**/*.clienttest.{ts,tsx}"],
          exclude: sharedExclude,
          environment: "jsdom",
          setupFiles: ["@testing-library/jest-dom/vitest"],
        },
      },
      {
        extends: true,
        test: {
          name: "server",
          include: ["src/**/server/**/*.servertest.{ts,tsx}"],
          exclude: [...sharedExclude, "src/__e2e__/**"],
          environment: "node",
          setupFiles: ["./src/__tests__/after-teardown.ts"],
          globalSetup: ["./src/__tests__/vitest-global-teardown.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "e2e-server",
          include: ["src/**/*.servertest.{ts,tsx}"],
          exclude: [...sharedExclude, "src/__tests__/**"],
          environment: "node",
          setupFiles: ["./src/__tests__/after-teardown.ts"],
          globalSetup: ["./src/__tests__/vitest-global-teardown.ts"],
        },
      },
    ],
  },
});
