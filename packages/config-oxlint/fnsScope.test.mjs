import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const webRoot = path.join(repoRoot, "web");

function lint(relativePaths) {
  try {
    return execFileSync(
      "pnpm",
      ["exec", "oxlint", "--max-warnings", "0", ...relativePaths],
      { cwd: webRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (error) {
    return `${error.stdout ?? ""}\n${error.stderr ?? ""}`;
  }
}

test("fns scoping lives in the oxlint config", () => {
  const directory = mkdtempSync(path.join(webRoot, "src/features/fns-scope-"));
  const fns = path.join(directory, "fns");
  mkdirSync(fns);
  const relative = path.relative(webRoot, fns);
  writeFileSync(
    path.join(fns, "keepsOne.ts"),
    "export function keepsOne() { return 1; }\n",
  );
  writeFileSync(
    path.join(fns, "exportsTwo.ts"),
    "export function left() { return 1; }\nexport function right() { return 2; }\n",
  );
  writeFileSync(
    path.join(fns, "exportsTwo.test.ts"),
    "export function left() { return 1; }\nexport function right() { return 2; }\n",
  );

  try {
    const output = lint([
      path.join(relative, "keepsOne.ts"),
      path.join(relative, "exportsTwo.ts"),
      path.join(relative, "exportsTwo.test.ts"),
      "src/features/traces/fns/treeBuilding.ts",
    ]);
    assert.match(output, /exportsTwo\.ts/);
    assert.match(output, /fns-single-function-export/);
    assert.doesNotMatch(output, /keepsOne\.ts/);
    assert.doesNotMatch(output, /exportsTwo\.test\.ts/);
    assert.doesNotMatch(output, /treeBuilding\.ts/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
