import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import { config } from "dotenv";
import { expand } from "dotenv-expand";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { VitestCiReporter } from "../scripts/vitest/ci-reporter";

expand(config({ path: "../.env.test" }));
expand(config({ path: "../.env" }));

const sharedExclude = [
  "**/node_modules/**",
  "**/.next/**",
  "**/.next-check/**",
  "**/dist/**",
];

// The server suite spends more time importing the heavy @langfuse/shared
// module graph per test file than running tests (measured in CI: 371s
// cumulative import vs 264s tests). Files that do not touch process-global
// state therefore run with `isolate: false` (project "server") so each
// worker imports the graph once instead of per file. Files that mock
// modules, spy, fake timers, mutate process.env, or close shared
// connections (redis.disconnect() etc.) would leak that state into other
// files in a shared context, so they keep the default per-file isolation
// (project "server-isolated"). Classification is content-based at config
// load so new test files sort themselves into the right project.
const GLOBAL_STATE_PATTERN =
  /vi\.(mock|doMock|unmock|spyOn|useFakeTimers|setSystemTime|resetModules|stubEnv|stubGlobal|unstubAllEnvs|unstubAllGlobals)|process\.env\.[A-Z0-9_]+\s*=[^=]|process\.env\[[^\]]+\]\s*=[^=]|delete\s+process\.env|\(env as any\)\.\w+\s*=[^=]|\.(disconnect|quit|shutdown)\(|disconnectQueues/;

const serverTestFiles = globSync("src/**/server/**/*.servertest.{ts,tsx}", {
  cwd: import.meta.dirname,
  exclude: [
    "**/node_modules/**",
    "src/__e2e__/**",
    "src/__tests__/server/unit/**",
  ],
});
const isolatedServerTestFiles = serverTestFiles.filter((file) =>
  GLOBAL_STATE_PATTERN.test(
    readFileSync(join(import.meta.dirname, file), "utf8"),
  ),
);
const sharedContextServerTestFiles = serverTestFiles.filter(
  (file) => !isolatedServerTestFiles.includes(file),
);

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
          include: sharedContextServerTestFiles,
          exclude: sharedExclude,
          isolate: false,
          // Workers are reused across files, so the per-file teardown must
          // not disconnect shared singletons (redis, ClickHouse) that later
          // files in the same worker still use. See after-teardown.ts.
          env: { VITEST_SHARED_CONTEXT: "1" },
          environment: "node",
          setupFiles: ["./src/__tests__/after-teardown.ts"],
          globalSetup: ["./src/__tests__/vitest-test-db-setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "server-isolated",
          include: isolatedServerTestFiles,
          exclude: sharedExclude,
          environment: "node",
          setupFiles: ["./src/__tests__/after-teardown.ts"],
          globalSetup: ["./src/__tests__/vitest-test-db-setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "server-unit",
          include: ["src/__tests__/server/unit/**/*.servertest.{ts,tsx}"],
          exclude: sharedExclude,
          environment: "node",
          setupFiles: ["./src/__tests__/after-teardown.ts"],
        },
      },
      {
        extends: true,
        plugins: [
          storybookTest({
            configDir: join(import.meta.dirname, ".storybook"),
            storybookScript: "pnpm run storybook -- --ci --no-open",
          }),
        ],
        test: {
          name: "storybook",
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: "chromium" }],
          },
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
          globalSetup: ["./src/__tests__/vitest-test-db-setup.ts"],
        },
      },
    ],
  },
});
