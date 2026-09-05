import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";

const repo = resolve(import.meta.dirname, "../..");

// Exercise the actual web config and Markdown/React/alias plugins in a disposable
// workspace. Cached transforms must still execute tests and notice changed inputs.
test("Vitest transforms stay correct after restoring a warm cache", () => {
  const root = mkdtempSync(join(tmpdir(), "langfuse-vitest-cache-"));
  const web = join(root, "web");
  const write = (file, content) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  };
  const copy = (file) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    copyFileSync(join(repo, file), join(root, file));
  };

  try {
    for (const file of [
      "web/package.json",
      "web/tsconfig.json",
      "scripts/vitest/transform-cache.mjs",
      "scripts/vitest/ci-reporter.ts",
    ]) {
      copy(file);
    }
    write("package.json", JSON.stringify({ private: true }));
    write("pnpm-workspace.yaml", 'packages:\n  - "web"\n');
    write("pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
    write(
      "web/.storybook/main.ts",
      'export default { stories: ["../src/**/*.stories.tsx"], addons: [], framework: "@storybook/nextjs-vite" };\n',
    );
    // Keep the cache local to this temporary workspace while resolving packages
    // through the same installed dependency graph as the real web tests.
    mkdirSync(join(root, "node_modules"));
    symlinkSync(
      join(repo, "web/node_modules"),
      join(web, "node_modules"),
      "dir",
    );

    let config = readFileSync(
      join(repo, "web/vitest.config.mts"),
      "utf8",
    ).replace(
      "export default defineConfig({",
      'export default defineConfig({\n  define: { __CACHE_CONFIG_MARKER__: JSON.stringify("first") },',
    );
    // This probe exercises transforms and does not need the DOM matcher setup.
    config = config.replace(
      'setupFiles: ["@testing-library/jest-dom/vitest"],',
      "setupFiles: [],",
    );
    write("web/vitest.config.mts", config);
    write("web/src/cache-probe-value.ts", "export const value = 1;\n");
    write(
      "web/alternate/src/cache-probe-value.ts",
      "export const value = 99;\n",
    );
    write("web/src/cache-probe.md", "first Markdown");
    write("web/src/cache-probe-added/index.ts", "export const added = 1;\n");
    write(
      "web/src/cache-probe-view.tsx",
      "export const View = () => <span>React transformed</span>;\n",
    );
    write(
      "web/src/cache-probe.clienttest.ts",
      `import { appendFileSync } from "node:fs";
import { expect, test } from "vitest";
import { value } from "@/src/cache-probe-value";
import markdown from "./cache-probe.md";
import { View } from "./cache-probe-view";
import { added } from "./cache-probe-added";
declare const __CACHE_CONFIG_MARKER__: string;
test("executes with current source, Markdown, React and config", () => {
  expect(value).toBe(Number(process.env.EXPECT_SOURCE));
  expect(added).toBe(Number(process.env.EXPECT_ADDED));
  expect(markdown).toBe(process.env.EXPECT_MARKDOWN);
  expect(View().props.children).toBe("React transformed");
  expect(__CACHE_CONFIG_MARKER__).toBe(process.env.EXPECT_CONFIG);
  expect(import.meta.env.VITE_CACHE_MARKER).toBe(process.env.VITE_CACHE_MARKER);
  appendFileSync(process.env.CACHE_PROBE_EXECUTIONS!, "executed\\n");
});\n`,
    );

    const env = {
      ...process.env,
      CI: "true",
      CI_VITEST_FS_CACHE: "1",
      DEBUG: "vitest:cache:fs",
      EXPECT_SOURCE: "1",
      EXPECT_ADDED: "1",
      EXPECT_MARKDOWN: "first Markdown",
      EXPECT_CONFIG: "first",
      VITE_CACHE_MARKER: "first",
      CACHE_PROBE_EXECUTIONS: join(root, "executions.txt"),
    };
    const run = (label) => {
      const result = spawnSync(
        "pnpm",
        ["exec", "vitest", "run", "--project", "client", "--maxWorkers=1"],
        { cwd: web, env, encoding: "utf8", timeout: 60_000 },
      );
      const output = `${result.stdout}\n${result.stderr}`;
      assert.equal(result.status, 0, `${label}: ${output}`);
      assert.match(output, /1 passed/);
      return output;
    };

    assert.match(run("cold"), /\[write\].*cache-probe-value\.ts/);
    assert.match(run("warm"), /\[read\].*cache-probe-value\.ts/);

    write("web/src/cache-probe-value.ts", "export const value = 2;\n");
    env.EXPECT_SOURCE = "2";
    assert.match(run("changed source"), /\[write\].*cache-probe-value\.ts/);

    write("web/src/cache-probe.md", "changed Markdown");
    env.EXPECT_MARKDOWN = "changed Markdown";
    assert.match(run("changed Markdown"), /\[write\].*cache-probe\.md/);

    config = config.replace(
      'JSON.stringify("first")',
      'JSON.stringify("second")',
    );
    write("web/vitest.config.mts", config);
    env.EXPECT_CONFIG = "second";
    assert.match(
      run("changed Vite config"),
      /\[write\].*cache-probe-value\.ts/,
    );

    const tsconfig = JSON.parse(
      readFileSync(join(web, "tsconfig.json"), "utf8"),
    );
    tsconfig.compilerOptions.paths["@/*"] = ["./alternate/*"];
    write("web/tsconfig.json", JSON.stringify(tsconfig));
    env.EXPECT_SOURCE = "99";
    assert.match(
      run("changed tsconfig alias"),
      /\[write\].*alternate.*cache-probe-value\.ts/,
    );

    env.VITE_CACHE_MARKER = "second";
    assert.match(
      run("changed transform environment"),
      /\[write\].*alternate.*cache-probe-value\.ts/,
    );

    config = config.replace(
      'JSON.stringify(readFileSync(path, "utf8"))',
      'JSON.stringify("plugin: " + readFileSync(path, "utf8"))',
    );
    write("web/vitest.config.mts", config);
    env.EXPECT_MARKDOWN = "plugin: changed Markdown";
    assert.match(run("changed Markdown plugin"), /\[write\].*cache-probe\.md/);

    write("web/src/cache-probe-added.ts", "export const added = 2;\n");
    env.EXPECT_ADDED = "2";
    assert.match(
      run("new extensionless import candidate"),
      /\[write\].*cache-probe-added\.ts/,
    );

    assert.equal(
      readFileSync(env.CACHE_PROBE_EXECUTIONS, "utf8"),
      "executed\n".repeat(9),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
