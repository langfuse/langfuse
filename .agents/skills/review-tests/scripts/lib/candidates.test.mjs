import assert from "node:assert/strict";
import test from "node:test";

import {
  buildModuleIndex,
  moduleWeight,
  packageRootOf,
  productionTargets,
  rankFiles,
  resolveImport,
  selectCandidates,
  similarity,
} from "./candidates.mjs";

const repo = new Set([
  "web/src/features/auth/validateToken.ts",
  "web/src/features/auth/index.ts",
  "web/src/features/auth/login.tsx",
  "web/src/features/auth/login.servertest.ts",
  "packages/shared/src/server/index.ts",
  "packages/shared/src/db.ts",
  "worker/src/queues/ingestion.ts",
]);
const exists = (p) => repo.has(p);

test("packageRootOf keeps the two-segment root for workspace packages", () => {
  assert.equal(packageRootOf("web/src/a.ts"), "web");
  assert.equal(packageRootOf("packages/shared/src/a.ts"), "packages/shared");
  assert.equal(packageRootOf("worker/src/a.ts"), "worker");
});

test("resolves a relative import, adding the extension", () => {
  assert.equal(
    resolveImport(
      "./validateToken",
      "web/src/features/auth/login.servertest.ts",
      exists,
    ),
    "web/src/features/auth/validateToken.ts",
  );
});

test("resolves a relative directory import through its index", () => {
  assert.equal(
    resolveImport("../auth", "web/src/features/other/x.test.ts", exists),
    "web/src/features/auth/index.ts",
  );
});

test("resolves the @/ alias against the importing package root", () => {
  assert.equal(
    resolveImport(
      "@/src/features/auth/validateToken",
      "web/src/a.test.ts",
      exists,
    ),
    "web/src/features/auth/validateToken.ts",
  );
});

test("resolves @langfuse/shared subpath and bare specifiers", () => {
  assert.equal(
    resolveImport(
      "@langfuse/shared/src/server",
      "worker/src/a.test.ts",
      exists,
    ),
    "packages/shared/src/server/index.ts",
  );
  assert.equal(
    resolveImport("@langfuse/shared/src/db", "worker/src/a.test.ts", exists),
    "packages/shared/src/db.ts",
  );
});

test("returns null for third-party and unresolvable specifiers", () => {
  assert.equal(resolveImport("vitest", "worker/src/a.test.ts", exists), null);
  assert.equal(resolveImport("node:fs", "worker/src/a.test.ts", exists), null);
  assert.equal(
    resolveImport("./missing", "worker/src/a.test.ts", exists),
    null,
  );
});

test("productionTargets drops test files and duplicates", () => {
  const targets = productionTargets(
    ["./validateToken", "./validateToken", "./login.servertest", "vitest"],
    "web/src/features/auth/other.servertest.ts",
    exists,
  );
  assert.deepEqual(targets, ["web/src/features/auth/validateToken.ts"]);
});

test("a module shared by many test files weighs less than an exclusive one", () => {
  const index = buildModuleIndex(
    new Map([
      ["a.test.ts", ["barrel.ts", "narrow.ts"]],
      ["b.test.ts", ["barrel.ts", "narrow.ts"]],
      ["c.test.ts", ["barrel.ts"]],
      ["d.test.ts", ["barrel.ts"]],
    ]),
  );
  assert.ok(
    moduleWeight(index, "narrow.ts") > moduleWeight(index, "barrel.ts"),
  );
});

test("rankFiles orders by weighted shared imports in degraded mode", () => {
  const testToModules = new Map([
    ["target.test.ts", ["barrel.ts", "narrow.ts"]],
    ["shares-narrow.test.ts", ["narrow.ts"]],
    ["shares-barrel.test.ts", ["barrel.ts"]],
    ["also-barrel.test.ts", ["barrel.ts"]],
    ["unrelated.test.ts", ["other.ts"]],
  ]);
  const ranked = rankFiles({ targetFile: "target.test.ts", testToModules });
  assert.deepEqual(
    ranked.map((r) => r.file),
    ["shares-narrow.test.ts", "also-barrel.test.ts", "shares-barrel.test.ts"],
  );
  assert.equal(ranked[0].basis, "imports");
  assert.ok(!ranked.some((r) => r.file === "unrelated.test.ts"));
});

test("rankFiles prefers the coverage map when it covers the target", () => {
  const coverage = {
    "target.test.ts": { "prod.ts": [[1, 10]] },
    "big-overlap.test.ts": { "prod.ts": [[5, 10]] },
    "small-overlap.test.ts": { "prod.ts": [[10, 10]] },
    "no-overlap.test.ts": { "prod.ts": [[40, 50]] },
  };
  const ranked = rankFiles({
    targetFile: "target.test.ts",
    testToModules: new Map(),
    coverage,
  });
  assert.deepEqual(
    ranked.map((r) => [r.file, r.overlap]),
    [
      ["big-overlap.test.ts", 6],
      ["small-overlap.test.ts", 1],
    ],
  );
  assert.equal(ranked[0].basis, "coverage");
});

test("rankFiles falls back to imports when the map lacks the target", () => {
  const ranked = rankFiles({
    targetFile: "target.test.ts",
    testToModules: new Map([
      ["target.test.ts", ["narrow.ts"]],
      ["other.test.ts", ["narrow.ts"]],
    ]),
    coverage: { "unrelated.test.ts": { "prod.ts": [[1, 2]] } },
  });
  assert.equal(ranked[0].basis, "imports");
});

test("similarity ignores boilerplate words", () => {
  assert.equal(similarity("it should be a thing", "the is are"), 0);
  assert.ok(
    similarity("rejects expired token", "rejects an expired token") >
      similarity("rejects expired token", "creates a project"),
  );
});

const mkTest = (file, name, line, assertions = []) => ({
  id: `${file}::${name}`,
  file,
  name,
  line,
  source: `it("${name}", () => {})`,
  assertions,
});

test("selectCandidates reserves budget for siblings and fills from ranked files", () => {
  const target = mkTest("a.test.ts", "rejects expired token", 10, [
    "expect(r).toBe(false)",
  ]);
  const testsByFile = new Map([
    [
      "a.test.ts",
      [
        target,
        mkTest("a.test.ts", "rejects an expired token again", 20),
        mkTest("a.test.ts", "creates a project", 30),
      ],
    ],
    [
      "b.test.ts",
      [mkTest("b.test.ts", "token validation rejects expired token", 88)],
    ],
    ["c.test.ts", [mkTest("c.test.ts", "unrelated behaviour", 5)]],
  ]);
  const ranked = [
    { file: "b.test.ts", overlap: 3, basis: "imports" },
    { file: "c.test.ts", overlap: 1, basis: "imports" },
  ];

  const picked = selectCandidates({ target, testsByFile, ranked, limit: 4 });

  assert.ok(
    !picked.some((c) => c.id === target.id),
    "never suggests the test itself",
  );
  assert.equal(picked.filter((c) => c.basis === "sibling").length, 2);
  assert.equal(
    picked[0].name,
    "rejects an expired token again",
    "closest sibling first",
  );
  assert.deepEqual(
    picked.slice(2).map((c) => c.file),
    ["b.test.ts", "c.test.ts"],
  );
  assert.equal(
    picked[2].line,
    88,
    "candidates carry file:line for the comment body",
  );
});

test("selectCandidates returns nothing when there is no other test", () => {
  const target = mkTest("a.test.ts", "only test", 1);
  const picked = selectCandidates({
    target,
    testsByFile: new Map([["a.test.ts", [target]]]),
    ranked: [],
    limit: 5,
  });
  assert.deepEqual(picked, []);
});

test("selectCandidates honours the limit", () => {
  const target = mkTest("a.test.ts", "t0", 1);
  const testsByFile = new Map([
    [
      "a.test.ts",
      [target, mkTest("a.test.ts", "t1", 2), mkTest("a.test.ts", "t2", 3)],
    ],
    ["b.test.ts", [mkTest("b.test.ts", "t3", 4)]],
    ["c.test.ts", [mkTest("c.test.ts", "t4", 5)]],
  ]);
  const ranked = [
    { file: "b.test.ts", overlap: 1, basis: "imports" },
    { file: "c.test.ts", overlap: 1, basis: "imports" },
  ];
  assert.equal(
    selectCandidates({ target, testsByFile, ranked, limit: 3 }).length,
    3,
  );
});
