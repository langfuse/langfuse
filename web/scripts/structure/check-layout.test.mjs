import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { checkLayout } from "./check-layout.mjs";

test("source layout prevents unowned features and misplaced framework entrypoints", () => {
  const root = mkdtempSync(join(tmpdir(), "source-layout-"));
  try {
    for (const path of ["src/scores", "src/app/hooks", "app", "pages"])
      mkdirSync(join(root, path), { recursive: true });
    writeFileSync(join(root, "instrumentation.ts"), "export {};");
    const registry = {
      domains: [{ path: "src/scores" }],
      sharedRoots: ["src/app/hooks"],
    };
    assert.deepEqual(checkLayout(root, registry), []);
    mkdirSync(join(root, "src/features"));
    assert.ok(
      checkLayout(root, registry).some((message) =>
        message.includes("src/features"),
      ),
    );
    rmSync(join(root, "pages"), { recursive: true });
    assert.ok(
      checkLayout(root, registry).some((message) =>
        message.includes("missing pages"),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("nested source modules need a declared owner even inside an allowed group", () => {
  const root = mkdtempSync(join(tmpdir(), "source-layout-"));
  try {
    for (const path of [
      "src/ai/assistant",
      "src/ai/new-capability",
      "src/app/hooks",
      "src/app/unowned",
      "src/ee/unowned",
      "app",
      "pages",
    ])
      mkdirSync(join(root, path), { recursive: true });
    writeFileSync(join(root, "instrumentation.ts"), "export {};");
    const modules = [
      "src/ai/new-capability/Foo.ts",
      "src/app/unowned/Widget.tsx",
      "src/ee/unowned/handler.mjs",
    ];
    for (const path of modules) writeFileSync(join(root, path), "export {};");
    const registry = {
      domains: [{ path: "src/ai/assistant" }],
      sharedRoots: ["src/app/hooks"],
    };
    assert.deepEqual(
      checkLayout(root, registry).sort(),
      modules
        .map(
          (path) =>
            `rule-declared-source-owners: ${path} needs an owning domain or shared-root entry in source-structure.json`,
        )
        .sort(),
    );
    assert.deepEqual(
      checkLayout(root, {
        domains: [
          ...registry.domains,
          { path: "src/ai/new-capability" },
          { path: "src/ee/unowned" },
        ],
        sharedRoots: [...registry.sharedRoots, "src/app/unowned"],
      }),
      [],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("infrastructure, root bootstrap files and prose do not need capability owners", () => {
  const root = mkdtempSync(join(tmpdir(), "source-layout-"));
  try {
    const modules = [
      "src/server/api/root.ts",
      "src/__tests__/server/example.ts",
      "src/__e2e__/flow.js",
      "src/app/workers/parser.mts",
      "src/app/polyfills/browser.cjs",
      "src/initialize.ts",
    ];
    for (const path of [
      ...modules,
      "src/ee/README.md",
      "src/app/guide/README.md",
      "src/app/guide/types.d.ts",
      "instrumentation.ts",
    ]) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), "");
    }
    for (const path of ["app", "pages"])
      mkdirSync(join(root, path), { recursive: true });
    assert.deepEqual(checkLayout(root, { domains: [], sharedRoots: [] }), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
