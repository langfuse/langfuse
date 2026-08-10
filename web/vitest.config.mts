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

const allServerTestFiles = globSync("src/**/server/**/*.servertest.{ts,tsx}", {
  cwd: import.meta.dirname,
  exclude: ["**/node_modules/**", "src/__e2e__/**"],
});
const SHARED_SOURCE_IDENTITY_PATTERN =
  /@langfuse\/shared\/(?:in-app-agent|src\/env)/;
// Derive membership from imports so new tests cannot silently miss aliases.
const sharedSourceTestFiles = allServerTestFiles.filter((file) =>
  SHARED_SOURCE_IDENTITY_PATTERN.test(
    readFileSync(join(import.meta.dirname, file), "utf8"),
  ),
);
const sharedSourceUnitTestFiles = sharedSourceTestFiles.filter((file) =>
  file.startsWith("src/__tests__/server/unit/"),
);
const sharedSourceIntegrationTestFiles = sharedSourceTestFiles.filter(
  (file) => !sharedSourceUnitTestFiles.includes(file),
);
const serverTestFiles = allServerTestFiles.filter(
  (file) =>
    !file.startsWith("src/__tests__/server/unit/") &&
    !sharedSourceIntegrationTestFiles.includes(file),
);
const isolatedServerTestFiles = serverTestFiles.filter((file) =>
  GLOBAL_STATE_PATTERN.test(
    readFileSync(join(import.meta.dirname, file), "utf8"),
  ),
);
const sharedContextServerTestFiles = serverTestFiles.filter(
  (file) => !isolatedServerTestFiles.includes(file),
);

function markdownRawPlugin() {
  return {
    name: "markdown-raw",
    enforce: "pre",
    load(id) {
      const path = id.split("?", 1)[0];
      if (!path?.endsWith(".md")) return null;

      return `export default ${JSON.stringify(readFileSync(path, "utf8"))};`;
    },
  };
}

const sharedSourcePath = (path: string) =>
  join(import.meta.dirname, "../packages/shared/src", path);

// Shared's built dist is CJS, whose require() calls bypass Vitest's module
// graph. Tests that mock the in-app-agent runtime or mutate shared's env need
// one source module identity; applying these aliases globally makes every
// server test transform shared.
const sharedSourceResolve = {
  alias: [
    {
      find: /^@langfuse\/shared\/in-app-agent\/server\/(.+)$/,
      replacement: sharedSourcePath("in-app-agent/server/$1"),
    },
    {
      find: /^@langfuse\/shared\/in-app-agent\/server$/,
      replacement: sharedSourcePath("in-app-agent/server/index.ts"),
    },
    {
      find: /^@langfuse\/shared\/in-app-agent$/,
      replacement: sharedSourcePath("in-app-agent/index.ts"),
    },
    // The runtime source reaches the rest of shared via relative imports
    // (../../../server etc.), so shared's other entry points must resolve
    // to the same source files — otherwise tests would load a second dist
    // copy of shared (split singletons, vi.mock("@langfuse/shared/src/
    // server") missing the runtime's imports).
    {
      find: /^@langfuse\/shared\/src\/(.+)$/,
      replacement: sharedSourcePath("$1"),
    },
    {
      find: /^@langfuse\/shared\/encryption$/,
      replacement: sharedSourcePath("encryption/index.ts"),
    },
    {
      find: /^@langfuse\/shared\/query$/,
      replacement: sharedSourcePath("features/query/index.ts"),
    },
    {
      find: /^@langfuse\/shared\/query\/server$/,
      replacement: sharedSourcePath("features/query/server/index.ts"),
    },
    {
      find: /^@langfuse\/shared\/monitors$/,
      replacement: sharedSourcePath("features/monitors/index.ts"),
    },
    {
      find: /^@langfuse\/shared\/monitors\/server$/,
      replacement: sharedSourcePath("features/monitors/server.ts"),
    },
    {
      find: /^@langfuse\/shared$/,
      replacement: sharedSourcePath("index.ts"),
    },
  ],
  // Runtime source resolves these through shared's node_modules symlinks.
  // Dedupe keeps one module identity so mocks registered from web intercept.
  dedupe: [
    "@mastra/core",
    "@mastra/mcp",
    "@ag-ui/core",
    "@ag-ui/client",
    "@ag-ui/mastra",
    "ai-sdk-amazon-bedrock-v4",
    "langfuse",
  ],
};

function serverProject(
  name: string,
  include: string[],
  options: {
    database?: boolean;
    env?: Record<string, string>;
    exclude?: string[];
    isolate?: boolean;
    resolve?: typeof sharedSourceResolve;
  } = {},
) {
  return {
    extends: true as const,
    ...(options.resolve ? { resolve: options.resolve } : {}),
    test: {
      name,
      include,
      exclude: [...sharedExclude, ...(options.exclude ?? [])],
      ...(options.isolate === undefined ? {} : { isolate: options.isolate }),
      ...(options.env ? { env: options.env } : {}),
      environment: "node" as const,
      setupFiles: ["./src/__tests__/after-teardown.ts"],
      ...(options.database
        ? { globalSetup: ["./src/__tests__/vitest-test-db-setup.ts"] }
        : {}),
    },
  };
}

export default defineConfig({
  plugins: [markdownRawPlugin(), tsconfigPaths(), react()],
  resolve: {
    alias: [
      // next-query-params ships a CJS `pages` entry whose default-export
      // interop breaks when the package is inlined (server.deps.inline
      // below, needed so vi.mock("next/router") intercepts the adapter's
      // own router import). Point at the ESM bundle instead.
      {
        find: /^next-query-params\/pages$/,
        replacement: join(
          import.meta.dirname,
          "node_modules/next-query-params/dist/pages.esm.js",
        ),
      },
    ],
  },
  test: {
    reporters: process.env.CI
      ? ["default", new VitestCiReporter()]
      : ["default"],
    silent: "passed-only",
    globals: true,
    retry: process.env.CI ? 3 : 0,
    // Servertests are DB-roundtrip bound, so hundreds cross the default 300ms
    // slow threshold on CI and the default reporter prints a line for each.
    // VitestCiReporter's top-10 slowest summary is unaffected (own accounting).
    slowTestThreshold: process.env.CI ? 2_000 : 300,
    testTimeout: 30_000,
    server: {
      deps: {
        // next-query-params is inlined so vi.mock("next/router") also
        // intercepts the adapter's own router import in clienttests.
        inline: [/@langfuse\//, "next-query-params"],
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
      serverProject("server", sharedContextServerTestFiles, {
        database: true,
        isolate: false,
        // Workers are reused across files, so the per-file teardown must not
        // disconnect shared singletons (redis, ClickHouse) that later files
        // in the same worker still use. See after-teardown.ts.
        env: { VITEST_SHARED_CONTEXT: "1" },
      }),
      serverProject("server-isolated", isolatedServerTestFiles, {
        database: true,
      }),
      serverProject("server-shared-source", sharedSourceIntegrationTestFiles, {
        database: true,
        resolve: sharedSourceResolve,
      }),
      serverProject(
        "server-unit",
        ["src/__tests__/server/unit/**/*.servertest.{ts,tsx}"],
        { exclude: sharedSourceUnitTestFiles },
      ),
      serverProject("server-shared-source-unit", sharedSourceUnitTestFiles, {
        resolve: sharedSourceResolve,
      }),
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
