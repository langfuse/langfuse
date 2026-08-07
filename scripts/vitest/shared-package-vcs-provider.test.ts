import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  addForceFullRunTrigger,
  addSharedPackageBuildOutputs,
  createSharedPackageVcsProvider,
} from "./shared-package-vcs-provider.ts";

test("forces full runs for global test inputs", () => {
  const repositoryRoot = "/repo";
  const forceFullRunPath = join(repositoryRoot, ".vitest-force-full-run");

  for (const file of [
    ".github/workflows/pipeline.yml",
    "package.json",
    "web/package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    ".npmrc",
    ".node-version",
    ".tool-versions",
    "turbo.json",
    "web/vitest.config.mts",
    "worker/tsconfig.json",
    "Dockerfile",
    "worker/Dockerfile.production",
    "docker-compose.dev.yml",
    ".env.dev.example",
    "packages/shared/prisma/schema.prisma",
    "packages/shared/clickhouse/migrations/unclustered/1_up.sql",
    "packages/shared/scripts/seeder/seed-postgres.ts",
    "patches/example.patch",
    "scripts/vitest/ci-reporter.ts",
    "web/src/__tests__/vitest-test-db-setup.ts",
  ]) {
    assert.deepEqual(
      addForceFullRunTrigger([join(repositoryRoot, file)], repositoryRoot),
      [join(repositoryRoot, file), forceFullRunPath],
      file,
    );
  }

  for (const file of [
    "web/src/features/example.ts",
    "worker/src/queues/example.ts",
    "packages/shared/src/server/example.ts",
    "docs/example.md",
  ]) {
    const changedFile = join(repositoryRoot, file);
    assert.deepEqual(
      addForceFullRunTrigger([changedFile], repositoryRoot),
      [changedFile],
      file,
    );
  }
});

test("leaves package-local changes for Vitest's dependency graph", () => {
  const repositoryRoot = "/repo";
  const changedFiles = [
    join(repositoryRoot, "web/src/features/example.ts"),
    join(repositoryRoot, "worker/src/queues/example.ts"),
  ];

  assert.deepEqual(
    addSharedPackageBuildOutputs(changedFiles, repositoryRoot),
    changedFiles,
  );
});

test("adds tsc output paths for shared TypeScript sources", () => {
  const repositoryRoot = "/repo";
  const sourceFile = join(
    repositoryRoot,
    "packages/shared/src/server/example.ts",
  );
  const unrelatedFile = join(repositoryRoot, "web/src/example.ts");
  const publicEntrypoint = join(
    repositoryRoot,
    "packages/shared/dist/src/index.js",
  );

  assert.deepEqual(
    addSharedPackageBuildOutputs([sourceFile, unrelatedFile], repositoryRoot, [
      publicEntrypoint,
    ]),
    [
      sourceFile,
      unrelatedFile,
      join(repositoryRoot, "packages/shared/dist/src/server/example.js"),
      publicEntrypoint,
    ],
  );
});

test("finds Git changes and exposes shared build outputs", async () => {
  const repositoryRoot = realpathSync(
    mkdtempSync(join(tmpdir(), "shared-vcs-provider-")),
  );

  try {
    const sourceFile = join(
      repositoryRoot,
      "packages/shared/src/server/example.ts",
    );
    const webRoot = join(repositoryRoot, "web");
    mkdirSync(join(repositoryRoot, "packages/shared/src/server"), {
      recursive: true,
    });
    mkdirSync(webRoot);
    writeFileSync(sourceFile, "export const value = 1;\n");
    writeFileSync(
      join(repositoryRoot, "packages/shared/package.json"),
      JSON.stringify({
        exports: {
          ".": { import: "./dist/src/index.js" },
          "./src/server": { import: "./dist/src/server/index.js" },
          "./wildcard/*": { import: "./dist/src/wildcard/*.js" },
        },
      }),
    );

    const git = (...args: string[]) =>
      execFileSync("git", ["-C", repositoryRoot, ...args], {
        encoding: "utf8",
      }).trim();
    git("init", "--initial-branch=main");
    git("config", "user.email", "tests@example.com");
    git("config", "user.name", "Tests");
    git("add", ".");
    git("commit", "-m", "initial");
    const base = git("rev-parse", "HEAD");

    writeFileSync(sourceFile, "export const value = 2;\n");
    git("add", ".");
    git("commit", "-m", "change shared source");

    const changedFiles =
      await createSharedPackageVcsProvider().findChangedFiles({
        root: webRoot,
        changedSince: base,
      });

    assert.deepEqual(changedFiles, [
      sourceFile,
      join(repositoryRoot, "packages/shared/dist/src/server/example.js"),
      join(repositoryRoot, "packages/shared/dist/src/index.js"),
      join(repositoryRoot, "packages/shared/dist/src/server/index.js"),
    ]);
  } finally {
    rmSync(repositoryRoot, { recursive: true, force: true });
  }
});

test("falls back to the full suite when Git comparison fails", async () => {
  const root = "/missing/repository";
  const originalWarn = console.warn;
  console.warn = () => undefined;

  try {
    assert.deepEqual(
      await createSharedPackageVcsProvider().findChangedFiles({
        root,
        changedSince: "missing-base",
      }),
      [join(root, ".vitest-force-full-run")],
    );
  } finally {
    console.warn = originalWarn;
  }
});
