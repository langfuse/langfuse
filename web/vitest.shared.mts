import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { expand } from "dotenv-expand";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { type Plugin } from "vite";
import { VitestCiReporter } from "../scripts/vitest/ci-reporter";

expand(config({ path: "../.env.test" }));
expand(config({ path: "../.env" }));

function markdownRawPlugin(): Plugin {
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

export default defineConfig({
  plugins: [markdownRawPlugin(), tsconfigPaths(), react()],
  resolve: {
    alias: [
      // Tests and stories are excluded from the tsconfig discovered by tsconfigPaths.
      { find: /^@\//, replacement: `${import.meta.dirname}/` },
      // Inline the ESM entry so vi.mock("next/router") intercepts this adapter.
      {
        find: /^next-query-params\/pages$/,
        replacement: join(
          import.meta.dirname,
          "node_modules/next-query-params/dist/pages.esm.js",
        ),
      },
      {
        find: /^next\/font\/local$/,
        replacement: join(
          import.meta.dirname,
          "src/__tests__/mocks/nextFontLocal.ts",
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
    // DB-roundtrip tests routinely exceed the default 300ms threshold.
    slowTestThreshold: process.env.CI ? 2_000 : 300,
    testTimeout: 30_000,
    server: {
      deps: {
        // Inlining lets client tests mock next/router inside the adapter.
        inline: [/@langfuse\//, "next-query-params"],
      },
    },
  },
});
