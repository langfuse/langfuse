import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSymbolIndex,
  callSymbols,
  packageRootOf,
  productionTargets,
  rankTests,
  resolveImport,
  selectCandidates,
  similarity,
  symbolWeight,
} from "./candidates.mjs";

const repo = new Set([
  "web/src/features/auth/validateToken.ts",
  "web/src/features/auth/index.ts",
  "web/src/features/auth/login.tsx",
  "web/src/features/auth/login.servertest.ts",
  "web/src/components/Table.tsx",
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

const SERVER = "packages/shared/src/server/index.ts";

test("callSymbols qualifies called imports by their resolved module", () => {
  const bindings = [
    {
      local: "createTrace",
      imported: "createTrace",
      spec: "@langfuse/shared/src/server",
    },
    { local: "validate", imported: "validateToken", spec: "./validateToken" },
    { local: "unused", imported: "unused", spec: "./validateToken" },
  ];
  const source =
    'it("x", async () => { await createTrace({}); expect(validate(t)).toBe(false); })';
  assert.deepEqual(
    callSymbols(
      source,
      bindings,
      "web/src/features/auth/a.servertest.ts",
      exists,
    ),
    [
      `${SERVER}#createTrace`,
      "web/src/features/auth/validateToken.ts#validateToken",
    ],
  );
});

test("callSymbols records member calls on a binding and on a namespace", () => {
  const bindings = [
    { local: "prisma", imported: "prisma", spec: "@langfuse/shared/src/db" },
    { local: "server", imported: "*", spec: "@langfuse/shared/src/server" },
  ];
  const source =
    "it('x', async () => { await prisma.trace.findMany({}); server.createTrace({}); })";
  assert.deepEqual(
    callSymbols(source, bindings, "worker/src/a.test.ts", exists),
    [
      "packages/shared/src/db.ts#prisma.trace.findMany",
      `${SERVER}#createTrace`,
    ],
  );
});

test("callSymbols counts JSX usage as a call", () => {
  const bindings = [
    { local: "Table", imported: "Table", spec: "@/src/components/Table" },
  ];
  const source = 'it("renders", () => { render(<Table rows={[]} />); })';
  assert.deepEqual(
    callSymbols(source, bindings, "web/src/a.clienttest.tsx", exists),
    ["web/src/components/Table.tsx#Table"],
  );
});

test("callSymbols ignores third-party, test-file and string-only mentions", () => {
  const bindings = [
    { local: "vi", imported: "vi", spec: "vitest" },
    { local: "helper", imported: "helper", spec: "./login.servertest" },
    {
      local: "createTrace",
      imported: "createTrace",
      spec: "@langfuse/shared/src/server",
    },
  ];
  const source =
    'it("x", () => { vi.fn(); helper(); const s = "createTrace(" })';
  assert.deepEqual(
    callSymbols(
      source,
      bindings,
      "web/src/features/auth/b.servertest.ts",
      exists,
    ),
    [],
  );
});

test("a symbol called from many test files weighs less than an exclusive one", () => {
  const byTestId = new Map([
    ["a::1", { file: "a.test.ts", symbols: ["m#fixture", "m#narrow"] }],
    ["b::1", { file: "b.test.ts", symbols: ["m#fixture", "m#narrow"] }],
    ["c::1", { file: "c.test.ts", symbols: ["m#fixture"] }],
    ["d::1", { file: "d.test.ts", symbols: ["m#fixture"] }],
  ]);
  const index = buildSymbolIndex(byTestId);
  assert.equal(index.get("m#fixture").size, 4);
  assert.ok(symbolWeight(index, "m#narrow") > symbolWeight(index, "m#fixture"));
});

const mkTest = (file, name, line, assertions = []) => ({
  id: `${file}::${name}`,
  file,
  name,
  line,
  source: `it("${name}", () => {})`,
  assertions,
});

const entry = (test, symbols) => [test.id, { file: test.file, test, symbols }];

test("rankTests orders other files' tests by weighted shared symbols", () => {
  const target = mkTest("t.test.ts", "target", 1);
  const narrow = mkTest("n.test.ts", "shares narrow", 1);
  const fixtureOnly = mkTest("f.test.ts", "shares fixture", 1);
  const sibling = mkTest("t.test.ts", "sibling", 9);
  const unrelated = mkTest("u.test.ts", "unrelated", 1);
  const byTestId = new Map([
    entry(target, ["m#fixture", "m#narrow"]),
    entry(narrow, ["m#narrow"]),
    entry(fixtureOnly, ["m#fixture"]),
    entry(sibling, ["m#narrow"]),
    entry(unrelated, ["m#other"]),
    entry(mkTest("g.test.ts", "g", 1), ["m#fixture"]),
    entry(mkTest("h.test.ts", "h", 1), ["m#fixture"]),
  ]);
  const ranked = rankTests({
    target,
    byTestId,
    index: buildSymbolIndex(byTestId),
  });
  assert.deepEqual(
    ranked.map((r) => r.test.name),
    ["shares narrow", "shares fixture", "g", "h"],
  );
  assert.deepEqual(ranked[0].shared, ["m#narrow"]);
  assert.ok(
    !ranked.some((r) => r.test.file === "t.test.ts"),
    "siblings are not ranked here",
  );
});

test("rankTests returns nothing for a test that calls no production symbol", () => {
  const target = mkTest("t.test.ts", "target", 1);
  const byTestId = new Map([
    entry(target, []),
    entry(mkTest("o.test.ts", "o", 1), ["m#x"]),
  ]);
  assert.deepEqual(
    rankTests({ target, byTestId, index: buildSymbolIndex(byTestId) }),
    [],
  );
});

test("similarity ignores boilerplate words", () => {
  assert.equal(similarity("it should be a thing", "the is are"), 0);
  assert.ok(
    similarity("rejects expired token", "rejects an expired token") >
      similarity("rejects expired token", "creates a project"),
  );
});

test("selectCandidates reserves half the budget for siblings, symbol overlap first", () => {
  const target = mkTest("a.test.ts", "rejects expired token", 10, [
    "expect(r).toBe(false)",
  ]);
  const sameSymbol = mkTest("a.test.ts", "unrelated name", 20);
  const sameWords = mkTest("a.test.ts", "rejects an expired token again", 30);
  const other = mkTest("a.test.ts", "creates a project", 40);
  const cross = mkTest(
    "b.test.ts",
    "token validation rejects expired token",
    88,
  );
  const weak = mkTest("c.test.ts", "shares only the fixture", 5);
  const testsByFile = new Map([
    ["a.test.ts", [target, sameSymbol, sameWords, other]],
    ["b.test.ts", [cross]],
    ["c.test.ts", [weak]],
  ]);
  // `m#fixture` stands in for a helper every test calls: used by many files,
  // so it weighs almost nothing. `m#validate` is shared by two files only.
  const broadUsers = "defghijk"
    .split("")
    .map((n) => entry(mkTest(`${n}.test.ts`, n, 1), ["m#fixture"]));
  const byTestId = new Map([
    entry(target, ["m#fixture", "m#validate"]),
    entry(sameSymbol, ["m#validate"]),
    entry(sameWords, []),
    entry(other, ["m#fixture"]),
    entry(cross, ["m#validate"]),
    entry(weak, ["m#fixture"]),
    ...broadUsers,
  ]);
  const index = buildSymbolIndex(byTestId);

  const picked = selectCandidates({
    target,
    testsByFile,
    byTestId,
    index,
    limit: 4,
  });

  assert.ok(
    !picked.some((c) => c.id === target.id),
    "never suggests the test itself",
  );
  assert.deepEqual(
    picked.slice(0, 2).map((c) => [c.name, c.basis]),
    [
      ["unrelated name", "sibling"],
      ["rejects an expired token again", "sibling"],
    ],
    "a rare shared symbol beats a name match; a name match beats a fixture-only overlap",
  );
  assert.deepEqual(picked[0].sharedSymbols, ["m#validate"]);
  assert.deepEqual(
    picked.slice(2).map((c) => [c.file, c.basis]),
    [
      ["b.test.ts", "symbols"],
      ["c.test.ts", "symbols"],
    ],
  );
  assert.equal(
    picked[2].line,
    88,
    "candidates carry file:line for the comment body",
  );
  assert.deepEqual(picked[2].sharedSymbols, ["m#validate"]);
});

test("selectCandidates takes at most two tests from one other file", () => {
  const target = mkTest("a.test.ts", "t", 1);
  const bTests = [1, 2, 3, 4].map((n) => mkTest("b.test.ts", `b${n}`, n));
  const cTest = mkTest("c.test.ts", "c", 1);
  const testsByFile = new Map([
    ["a.test.ts", [target]],
    ["b.test.ts", bTests],
    ["c.test.ts", [cTest]],
  ]);
  const byTestId = new Map([
    entry(target, ["m#f"]),
    ...bTests.map((t) => entry(t, ["m#f"])),
    entry(cTest, ["m#f"]),
  ]);
  const picked = selectCandidates({
    target,
    testsByFile,
    byTestId,
    index: buildSymbolIndex(byTestId),
    limit: 5,
  });
  assert.equal(picked.filter((c) => c.file === "b.test.ts").length, 2);
  assert.ok(picked.some((c) => c.file === "c.test.ts"));
});

test("selectCandidates returns nothing when there is no other test", () => {
  const target = mkTest("a.test.ts", "only test", 1);
  const byTestId = new Map([entry(target, ["m#f"])]);
  const picked = selectCandidates({
    target,
    testsByFile: new Map([["a.test.ts", [target]]]),
    byTestId,
    index: buildSymbolIndex(byTestId),
    limit: 5,
  });
  assert.deepEqual(picked, []);
});
