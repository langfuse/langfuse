import assert from "node:assert/strict";
import test from "node:test";

import { chunkClusters } from "./chunker.mjs";

const cluster = (id, symbol, tests) => ({
  id,
  ok: true,
  code: { symbol, line: 1 },
  tests,
});
const cand = (clusterId, rule, file, line) => ({
  clusterId,
  rule,
  file,
  line,
  reason: `${rule} flag`,
});

test("a cluster with no candidate is left out of every chunk", () => {
  const clusters = [
    cluster(0, "m#a", [{ file: "a.test.ts", line: 10 }]),
    cluster(1, "m#b", [{ file: "b.test.ts", line: 20 }]),
  ];
  const chunks = chunkClusters(clusters, [
    cand(0, "uniqueness", "a.test.ts", 10),
  ]);
  assert.equal(chunks.length, 1);
  assert.deepEqual(
    chunks[0].clusters.map((c) => c.id),
    [0],
  );
});

test("two candidate clusters that share a member test become one chunk", () => {
  const clusters = [
    cluster(0, "m#a", [
      { file: "a.test.ts", line: 10 },
      { file: "shared.test.ts", line: 5 },
    ]),
    cluster(1, "m#b", [
      { file: "b.test.ts", line: 20 },
      { file: "shared.test.ts", line: 5 },
    ]),
  ];
  const candidates = [
    cand(1, "ownership", "b.test.ts", 20),
    cand(0, "uniqueness", "a.test.ts", 10),
  ];
  const chunks = chunkClusters(clusters, candidates);
  assert.equal(chunks.length, 1, "one union");
  assert.deepEqual(
    chunks[0].clusters.map((c) => c.id),
    [0, 1],
    "clusters sorted by id",
  );
  assert.deepEqual(
    chunks[0].candidates.map((c) => `${c.file}:${c.line}`),
    ["a.test.ts:10", "b.test.ts:20"],
    "candidates sorted by file then line",
  );
});

test("candidate clusters with no shared member test stay separate", () => {
  const clusters = [
    cluster(0, "m#a", [{ file: "a.test.ts", line: 10 }]),
    cluster(1, "m#b", [{ file: "b.test.ts", line: 20 }]),
  ];
  const chunks = chunkClusters(clusters, [
    cand(0, "uniqueness", "a.test.ts", 10),
    cand(1, "uniqueness", "b.test.ts", 20),
  ]);
  assert.equal(chunks.length, 2);
  assert.deepEqual(
    chunks.map((c) => c.clusters.map((x) => x.id)),
    [[0], [1]],
  );
});

test("union is transitive: A-B and B-C chain into one chunk", () => {
  const clusters = [
    cluster(0, "m#a", [
      { file: "a.test.ts", line: 1 },
      { file: "t1.test.ts", line: 5 },
    ]),
    cluster(1, "m#b", [
      { file: "t1.test.ts", line: 5 },
      { file: "t2.test.ts", line: 6 },
    ]),
    cluster(2, "m#c", [
      { file: "t2.test.ts", line: 6 },
      { file: "c.test.ts", line: 9 },
    ]),
  ];
  const candidates = [
    cand(0, "uniqueness", "a.test.ts", 1),
    cand(1, "uniqueness", "t1.test.ts", 5),
    cand(2, "uniqueness", "c.test.ts", 9),
  ];
  const chunks = chunkClusters(clusters, candidates);
  assert.equal(chunks.length, 1);
  assert.deepEqual(
    chunks[0].clusters.map((c) => c.id),
    [0, 1, 2],
  );
  assert.equal(chunks[0].candidates.length, 3);
});

test("clusters shared only through a non-candidate cluster are not joined", () => {
  // Cluster 1 has no candidate, so it does not participate and cannot bridge
  // clusters 0 and 2 even though it shares a test with each.
  const clusters = [
    cluster(0, "m#a", [
      { file: "a.test.ts", line: 1 },
      { file: "t1.test.ts", line: 5 },
    ]),
    cluster(1, "m#b", [
      { file: "t1.test.ts", line: 5 },
      { file: "t2.test.ts", line: 6 },
    ]),
    cluster(2, "m#c", [
      { file: "t2.test.ts", line: 6 },
      { file: "c.test.ts", line: 9 },
    ]),
  ];
  const chunks = chunkClusters(clusters, [
    cand(0, "uniqueness", "a.test.ts", 1),
    cand(2, "uniqueness", "c.test.ts", 9),
  ]);
  assert.equal(chunks.length, 2);
  assert.deepEqual(
    chunks.map((c) => c.clusters.map((x) => x.id)),
    [[0], [2]],
  );
});
