import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSymbolIndex,
  callSymbols,
  packageRootOf,
  productionTargets,
  resolveImport,
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

test("buildSymbolIndex counts a symbol's breadth of use across test files", () => {
  const byTestId = new Map([
    ["a::1", { file: "a.test.ts", symbols: ["m#fixture", "m#narrow"] }],
    ["b::1", { file: "b.test.ts", symbols: ["m#fixture", "m#narrow"] }],
    ["c::1", { file: "c.test.ts", symbols: ["m#fixture"] }],
    ["d::1", { file: "d.test.ts", symbols: ["m#fixture"] }],
  ]);
  const index = buildSymbolIndex(byTestId);
  assert.equal(index.get("m#fixture").size, 4);
  assert.equal(index.get("m#narrow").size, 2);
  // A broadly-used symbol weighs less than an exclusive one.
  assert.ok(symbolWeight(index, "m#narrow") > symbolWeight(index, "m#fixture"));
});
