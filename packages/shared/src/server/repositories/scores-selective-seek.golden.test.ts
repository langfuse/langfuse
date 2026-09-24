import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A hand-written exec-seam mock (no importOriginal) records each query and keeps
// the real repositories/queries barrels out of the mock resolution order, which
// otherwise reorders module init into the barrel cycle.
const recorder = vi.hoisted(() => {
  const captured: Array<{
    fn: string;
    query: string;
    params?: Record<string, unknown>;
    tags?: unknown;
  }> = [];
  // Unique per call — a constant would collide the param names of two filters of
  // the same class (e.g. the default project_id and a trace_id equality), and the
  // later bind would clobber the earlier one.
  let n = 0;
  const uid = () => `v${n++}`;
  return { captured, uid };
});

vi.mock("./clickhouse", () => ({
  queryClickhouse: vi.fn(async (opts: any) => {
    recorder.captured.push({ fn: "queryClickhouse", ...opts });
    // The count path reads rows[0].count; give it a benign shape. The rows path
    // maps over the result, so an empty array is correct there.
    return /count\(\*\) AS count/.test(opts.query) ? [{ count: "0" }] : [];
  }),
  queryClickhouseStream: vi.fn(),
  queryClickhouseExecRaw: vi.fn(),
  commandClickhouse: vi.fn(),
  upsertClickhouse: vi.fn(),
  parseClickhouseUTCDateTimeFormat: vi.fn(),
  clickhouseCompliantRandomCharacters: vi.fn(() => recorder.uid()),
  BLOB_EXPORT_PARQUET_CLICKHOUSE_SETTINGS: {},
}));

// query-options imports the server barrel, which cannot finish initializing when
// the graph is entered from this repository file; the events scores path never
// calls it.
vi.mock("../queries/clickhouse-sql/query-options", () => ({
  shouldSkipObservationsFinal: vi.fn().mockResolvedValue(false),
}));

// Import via the server barrel so it initializes in the correct order; entering
// the graph directly through ./scores trips a barrel init cycle.
import {
  getScoresUiCountFromEvents,
  getScoresUiTableFromEvents,
} from "../index";

import type { FilterState } from "../../types";
import {
  clickhouseFormatAvailable,
  clickhouseLocalAvailable,
  executeClickhouseLocal,
  normalizeCapturedQueries,
  substituteNamedParams,
} from "./goldenHarness";

const PROJECT_ID = "seek-project";
const ORDER_BY = { column: "timestamp", order: "DESC" as const };

// ── Filter fixtures ─────────────────────────────────────────────────────────
const traceIdEq = (value: string): FilterState => [
  { column: "traceId", type: "string", operator: "=", value },
];
const observationIdEq = (value: string): FilterState => [
  { column: "observationId", type: "string", operator: "=", value },
];
const nameIn = (values: string[]): FilterState => [
  { column: "name", type: "stringOptions", operator: "any of", value: values },
];
const valueGt = (value: number): FilterState => [
  { column: "value", type: "number", operator: ">", value },
];
const environmentNoneOf = (values: string[]): FilterState => [
  {
    column: "environment",
    type: "stringOptions",
    operator: "none of",
    value: values,
  },
];

const resetCaptures = () => {
  recorder.captured.length = 0;
};

async function captureCountSql(filter: FilterState) {
  resetCaptures();
  await getScoresUiCountFromEvents({
    projectId: PROJECT_ID,
    filter,
    orderBy: null,
  });
  expect(recorder.captured).toHaveLength(1);
  return recorder.captured[0];
}

async function captureRowsSql(filter: FilterState) {
  resetCaptures();
  await getScoresUiTableFromEvents({
    projectId: PROJECT_ID,
    filter,
    orderBy: ORDER_BY,
  });
  expect(recorder.captured).toHaveLength(1);
  return recorder.captured[0];
}

const SEEK_TUPLE_IN =
  /\(s\.project_id, toDate\(s\.timestamp\), s\.name, s\.id\) IN \(/;

const describeWithFormat = clickhouseFormatAvailable()
  ? describe
  : describe.skip;
const describeWithLocal = clickhouseLocalAvailable() ? describe : describe.skip;

if (!clickhouseFormatAvailable()) {
  console.warn(
    "[scores-seek] `clickhouse format` unavailable — skipping golden SQL tests.",
  );
}
if (!clickhouseLocalAvailable()) {
  console.warn(
    "[scores-seek] `clickhouse local` unavailable — skipping parity tests.",
  );
}

// ── Emitted SQL shape ───────────────────────────────────────────────────────
// The full matrix asserts *routing* only (does the seek phase fire for this
// filter?); whether a filter is eligible is unit-tested in
// score-seek-eligibility.test.ts. The full SQL text is locked by a single
// eligible + single ineligible snapshot below — snapshotting every shape just
// duplicates the same query skeleton.
describeWithFormat("scores selective-seek: emitted SQL", () => {
  beforeEach(() => resetCaptures());

  const eligible = [
    { name: "trace_id =", filter: traceIdEq("T2") },
    { name: "observation_id =", filter: observationIdEq("O1") },
    { name: "name IN", filter: nameIn(["n1"]) },
  ];
  const ineligible = [
    { name: "value range", filter: valueGt(0.5) },
    { name: "environment none of", filter: environmentNoneOf(["dev"]) },
    { name: "no filter", filter: [] as FilterState },
  ];

  describe("eligible → seek phase present", () => {
    for (const { name, filter } of eligible) {
      it(`count: ${name}`, async () => {
        const q = await captureCountSql(filter);
        expect(q.query).toContain("SELECT DISTINCT");
        expect(q.query).toMatch(SEEK_TUPLE_IN);
      });
      it(`rows: ${name}`, async () => {
        const q = await captureRowsSql(filter);
        expect(q.query).toContain("SELECT DISTINCT");
        expect(q.query).toMatch(SEEK_TUPLE_IN);
      });
    }
  });

  describe("ineligible → fallback unchanged, no seek", () => {
    for (const { name, filter } of ineligible) {
      it(`count: ${name}`, async () => {
        const q = await captureCountSql(filter);
        expect(q.query).not.toContain("SELECT DISTINCT");
        expect(q.query).not.toMatch(SEEK_TUPLE_IN);
      });
      it(`rows: ${name}`, async () => {
        const q = await captureRowsSql(filter);
        expect(q.query).not.toContain("SELECT DISTINCT");
        expect(q.query).not.toMatch(SEEK_TUPLE_IN);
      });
    }
  });

  // One representative shape per branch locks the full SQL text; the routing
  // matrix above covers the remaining shapes structurally.
  describe("full SQL text (one representative per branch)", () => {
    it("eligible (trace_id =): count", async () => {
      const q = await captureCountSql(traceIdEq("T2"));
      expect(normalizeCapturedQueries([q])).toMatchSnapshot();
    });
    it("eligible (trace_id =): rows", async () => {
      const q = await captureRowsSql(traceIdEq("T2"));
      expect(normalizeCapturedQueries([q])).toMatchSnapshot();
    });
    it("ineligible (value range): count", async () => {
      const q = await captureCountSql(valueGt(0.5));
      expect(normalizeCapturedQueries([q])).toMatchSnapshot();
    });
    it("ineligible (value range): rows", async () => {
      const q = await captureRowsSql(valueGt(0.5));
      expect(normalizeCapturedQueries([q])).toMatchSnapshot();
    });
  });
});

// ── Correctness parity vs FINAL over a multi-version fixture ─────────────────

// scores columns referenced by the count (argMax) and rows (SELECT *) paths.
const SCORES_DDL = `
  CREATE TABLE scores (
    id String,
    timestamp DateTime64(3),
    project_id String,
    trace_id String,
    observation_id Nullable(String),
    name String,
    value Float64,
    source String,
    comment Nullable(String),
    author_user_id Nullable(String),
    config_id Nullable(String),
    data_type String,
    string_value Nullable(String),
    queue_id Nullable(String),
    environment String,
    session_id Nullable(String),
    dataset_run_id Nullable(String),
    evaluator_id Nullable(String),
    evaluation_rule_id Nullable(String),
    execution_trace_id Nullable(String),
    metadata Map(String, String),
    ingestion_api_key String,
    ingestion_sdk_name String,
    ingestion_sdk_version String,
    created_at DateTime64(3),
    updated_at DateTime64(3),
    event_ts DateTime64(3),
    is_deleted UInt8,
    INDEX idx_id id TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_project_trace_observation (project_id, trace_id, observation_id) TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_project_session (project_id, session_id) TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_project_dataset_run (project_id, dataset_run_id) TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_created_at created_at TYPE minmax GRANULARITY 1,
    INDEX idx_evaluator_id evaluator_id TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_evaluation_rule_id evaluation_rule_id TYPE bloom_filter(0.001) GRANULARITY 1
  ) ENGINE = ReplacingMergeTree(event_ts, is_deleted)
  PARTITION BY toYYYYMM(timestamp)
  PRIMARY KEY (project_id, toDate(timestamp), name)
  ORDER BY (project_id, toDate(timestamp), name, id);
`;

// (id, name, ts, trace_id, observation_id, value, event_ts). Every row:
// project_id = PROJECT_ID, data_type = NUMERIC (listable), is_deleted = 0.
//  a: trace_id mutates T1 -> T2 (latest), value 0.9 -> 0.1
//  b: single version, trace_id T1
//  c: two day-buckets (distinct dedup groups), trace_id T3
//  d: has observation_id O1
//  e: value mutates 0.9 -> 0.1 (latest) — exercises dedup-then-filter
//  f: two rows sharing the SAME max event_ts (a tie) — the equality join emits
//     both, so the dedup must collapse them to one row before any filter runs
const ROWS: Array<
  [string, string, string, string, string | null, number, number]
> = [
  ["a", "n1", "2026-01-10 10:00:00.000", "T1", null, 0.9, 1],
  ["a", "n1", "2026-01-10 10:05:00.000", "T2", null, 0.1, 2],
  ["b", "n2", "2026-01-10 09:00:00.000", "T1", null, 0.2, 1],
  ["c", "n1", "2026-01-10 08:00:00.000", "T3", null, 0.5, 1],
  ["c", "n1", "2026-01-11 08:00:00.000", "T3", null, 0.6, 1],
  ["d", "n3", "2026-01-10 07:00:00.000", "T4", "O1", 0.4, 1],
  ["e", "n4", "2026-01-10 06:00:00.000", "T5", null, 0.9, 1],
  ["e", "n4", "2026-01-10 06:05:00.000", "T5", null, 0.1, 2],
  ["f", "n1", "2026-01-10 05:00:00.000", "T2", null, 0.9, 3],
  ["f", "n1", "2026-01-10 05:00:00.000", "T2", null, 0.9, 3],
];

const insertRows = () => {
  const values = ROWS.map(
    ([id, name, ts, traceId, obsId, value, eventTs]) =>
      `('${id}', '${ts}', '${PROJECT_ID}', '${traceId}', ${
        obsId === null ? "NULL" : `'${obsId}'`
      }, '${name}', ${value}, 'API', NULL, NULL, NULL, 'NUMERIC', NULL, NULL, 'default', NULL, NULL, NULL, NULL, NULL, map(), 'pk', 'sdk', '1', '${ts}', '${ts}', toDateTime64(${eventTs}, 3), 0)`,
  ).join(",\n");
  return `INSERT INTO scores VALUES ${values};`;
};

// FINAL ground truth: dedup on the ORDER BY key keeping max event_ts, then apply
// the same post-dedup predicate the outer WHERE applies.
const finalCount = (predicate: string) =>
  `SELECT count(*) FROM scores FINAL WHERE project_id = '${PROJECT_ID}' AND data_type = 'NUMERIC' AND (${predicate});`;
const finalIds = (predicate: string) =>
  `SELECT id FROM scores FINAL WHERE project_id = '${PROJECT_ID}' AND data_type = 'NUMERIC' AND (${predicate}) ORDER BY id;`;

const runLocal = (sql: string) =>
  executeClickhouseLocal(`${SCORES_DDL}\n${insertRows()}\n${sql}`);

const sortedLines = (out: string) =>
  out
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .sort();

describeWithLocal("scores selective-seek: parity vs FINAL", () => {
  // predicate is the equivalent hand-written SQL for the app filter, applied to
  // the deduped (FINAL) rows.
  const scenarios = [
    {
      name: "trace_id = T2 (latest matches)",
      filter: traceIdEq("T2"),
      predicate: "trace_id = 'T2'",
    },
    {
      name: "trace_id = T1 (old matched, latest does not)",
      filter: traceIdEq("T1"),
      predicate: "trace_id = 'T1'",
    },
    {
      name: "name IN [n1] (spans two day-buckets)",
      filter: nameIn(["n1"]),
      predicate: "name = 'n1'",
    },
    {
      name: "observation_id = O1",
      filter: observationIdEq("O1"),
      predicate: "observation_id = 'O1'",
    },
    {
      name: "value > 0.5 (ineligible fallback)",
      filter: valueGt(0.5),
      predicate: "value > 0.5",
    },
  ];

  for (const { name, filter, predicate } of scenarios) {
    it(`count parity: ${name}`, async () => {
      const q = await captureCountSql(filter);
      const appCount = runLocal(substituteNamedParams(q.query, q.params ?? {}));
      const refCount = runLocal(finalCount(predicate));
      expect(appCount.trim()).toBe(refCount.trim());
    });

    it(`rows parity: ${name}`, async () => {
      const q = await captureRowsSql(filter);
      const appOut = runLocal(substituteNamedParams(q.query, q.params ?? {}));
      const refOut = runLocal(finalIds(predicate));
      // The app rows query returns the full projection; its first column is id.
      const appIds = sortedLines(appOut).map((l) => l.split("\t")[0]);
      const refIds = sortedLines(refOut);
      expect(appIds).toEqual(refIds);
    });
  }
});

afterEach(() => resetCaptures());
