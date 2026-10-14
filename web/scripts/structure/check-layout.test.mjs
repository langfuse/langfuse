import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
