import assert from "node:assert/strict";
import test from "node:test";

import {
  buildClusters,
  buildReferenceBlocks,
  inHunks,
  parseHunks,
  seedSymbols,
} from "./clusters.mjs";
import { locateExport } from "./measure.mjs";

test("parseHunks maps each file to its added line ranges", () => {
  const diff = [
    "diff --git a/x.test.ts b/x.test.ts",
    "--- a/x.test.ts",
    "+++ b/x.test.ts",
    "@@ -10 +10,3 @@",
    "@@ -40,2 +42 @@",
    "diff --git a/y.test.ts b/y.test.ts",
    "--- a/y.test.ts",
    "+++ b/y.test.ts",
    "@@ -1,4 +1,0 @@",
  ].join("\n");
  const hunks = parseHunks(diff);
  assert.deepEqual(hunks.get("x.test.ts"), [
    [10, 12],
    [42, 42],
  ]);
  // A pure deletion (+n,0) contributes no range.
  assert.equal(hunks.has("y.test.ts"), false);
});

test("inHunks is true without ranges and on any overlap", () => {
  const t = { line: 10, endLine: 20 };
  assert.equal(inHunks(t, undefined), true);
  assert.equal(
    inHunks(t, [[15, 16]]),
    true,
    "a change inside the test block counts",
  );
  assert.equal(inHunks(t, [[25, 30]]), false);
});

test("seedSymbols unions the in-scope tests' symbols, deduped and sorted", () => {
  assert.deepEqual(
    seedSymbols([
      { symbols: ["m#b", "m#a"] },
      { symbols: ["m#a", "m#c"] },
      { symbols: [] },
    ]),
    ["m#a", "m#b", "m#c"],
  );
});

test("buildReferenceBlocks lists each symbol's referencing blocks, sorted", () => {
  const byTestId = new Map([
    ["y::1", { file: "y.test.ts", test: { line: 9 }, symbols: ["m#foo"] }],
    ["x::1", { file: "x.test.ts", test: { line: 5 }, symbols: ["m#foo"] }],
    ["x::2", { file: "x.test.ts", test: { line: 3 }, symbols: ["m#bar"] }],
  ]);
  const blocks = buildReferenceBlocks(byTestId);
  assert.deepEqual(blocks.get("m#foo"), [
    { file: "x.test.ts", line: 5 },
    { file: "y.test.ts", line: 9 },
  ]);
  assert.deepEqual(blocks.get("m#bar"), [{ file: "x.test.ts", line: 3 }]);
});

test("buildClusters keeps discriminating, locatable symbols and pre-filters the rest", () => {
  const broad = new Set(Array.from({ length: 13 }, (_, i) => `f${i}.test.ts`));
  const index = new Map([
    ["m/a.ts#foo", new Set(["x.test.ts", "y.test.ts"])],
    ["m/a.ts#bar", broad],
    ["m/db.ts#prisma.trace.findMany", new Set(["z.test.ts"])],
    ["m/missing.ts#gone", new Set(["w.test.ts"])],
  ]);
  const blocks = new Map([
    [
      "m/a.ts#foo",
      [
        { file: "x.test.ts", line: 5 },
        { file: "y.test.ts", line: 9 },
      ],
    ],
  ]);
  const sources = {
    "m/a.ts":
      "export function foo() { return 1; }\nexport function bar() { return 2; }",
    "m/db.ts": "export const prisma = makeClient();",
  };
  const clusters = buildClusters({
    seeds: [
      "m/a.ts#bar",
      "m/a.ts#foo",
      "m/db.ts#prisma.trace.findMany",
      "m/missing.ts#gone",
    ],
    index,
    blocks,
    threshold: 12,
    readSource: (p) => sources[p] ?? null,
    locate: locateExport,
  });
  assert.deepEqual(clusters, [
    // `m/a.ts#bar` is dropped: breadth 13 exceeds the threshold.
    {
      ok: true,
      code: { symbol: "m/a.ts#foo", line: 1 },
      tests: [
        { file: "x.test.ts", line: 5 },
        { file: "y.test.ts", line: 9 },
      ],
    },
    {
      ok: false,
      error: "could not locate export definition to stub",
      code: { symbol: "m/db.ts#prisma.trace.findMany" },
    },
    {
      ok: false,
      error: "could not read module source",
      code: { symbol: "m/missing.ts#gone" },
    },
  ]);
});
