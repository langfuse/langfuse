// Golden SQL for the v2 traces dashboard view (`eventsTracesView`, one row
// per trace aggregated from `events as e`), driven through
// `executeQuery(..., "v2", singleLevel)` so the chartConfig/config threading
// into QueryBuilder is pinned as prod sees it.
//
// Cases cover query shapes, not query inputs: one case per distinct SQL
// structure. Inputs that only change a column name or a literal inside an
// otherwise identical query get no case: sessionId, release, version and
// environment share the userId templates; uniqueSessionIds shares
// uniqueUserIds; scoreName takes the same `…Name` fallback as traceName. The
// rest of the aggregation switch is shared with the observations and scores
// views and covered by their goldens; histogram and p95 have cases here
// because they wrap the per-trace inner alias.
//
// Single-level needs every metric to lack `aggs` (no traces measure has
// them, so metrics=none) and no dimension with `aggregationFunction` (every
// dimension but `id`), so the single-level cases are metrics=none with no
// dimension or `id`.
//
// The default window is 72 hours, below the root-event threshold (168), so
// the root-event subquery is part of every case unless the case says
// otherwise: `measure=scoresCount` and `filter=metadata contains` are its
// crosses with the scores join and with events_full. Windows above the
// threshold and a threshold of 0 are in `queryExecutor.golden.test.ts`
// ("root-event window"); the ORDER BY a metric
// is the default order, so `dim=name` covers it.
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { env } from "../../../env";
import { granularities, type QueryType } from "../types";
import {
  capturedQueries,
  clickhouseFormatAvailable,
  normalizeCapturedQueries,
  resetCaptures,
} from "../../../server/repositories/__tests__/goldenHarness";

// Record the exec seam instead of hitting ClickHouse.
vi.mock("../../../server/repositories/clickhouse", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../server/repositories/clickhouse")
    >();
  const { buildClickhouseMock } =
    await import("../../../server/repositories/__tests__/goldenHarness.js");
  return buildClickhouseMock(actual);
});

// build() otherwise asks Redis whether the project is an OTEL user.
vi.mock("../../../server/queries/clickhouse-sql/query-options", () => ({
  shouldSkipObservationsFinal: vi.fn().mockResolvedValue(false),
  shouldSkipScoresDedup: vi.fn().mockReturnValue(false),
}));

import { shouldSkipScoresDedup } from "../../../server/queries/clickhouse-sql/query-options";
import { executeQuery } from "./queryExecutor";

const PROJECT = "golden-project";
const FROM = "2026-01-01T00:00:00.000Z";
const TO_72H = "2026-01-04T00:00:00.000Z";
const ROOT_EVENT_MAX_WINDOW_HOURS = 168;

type Filter = QueryType["filters"][number];

const BASE: QueryType = {
  view: "traces",
  dimensions: [],
  metrics: [{ measure: "count", aggregation: "count" }],
  filters: [],
  timeDimension: null,
  fromTimestamp: FROM,
  toTimestamp: TO_72H,
  orderBy: null,
};

/** Runs one v2 traces query through the exec mock; returns the golden. */
async function golden(overrides: Partial<QueryType>, singleLevel = false) {
  await executeQuery(PROJECT, { ...BASE, ...overrides }, "v2", singleLevel);
  return normalizeCapturedQueries(capturedQueries);
}

const METADATA_FULL: Filter = {
  column: "metadata",
  type: "stringObject",
  key: "region",
  operator: "contains",
  value: "eu",
};

const describeWithClickhouse = clickhouseFormatAvailable()
  ? describe
  : describe.skip;

if (!clickhouseFormatAvailable()) {
  console.warn(
    "[golden-harness] `clickhouse format` unavailable — skipping golden SQL tests. Install clickhouse-local to run them.",
  );
}

// One per-trace measure per kind, read as it is in the inner select.
// `count` is the default metric of every case.
const MEASURES: ReadonlyArray<
  [string, QueryType["metrics"][number]["aggregation"]]
> = [
  // uniqIf over non-root rows
  ["observationsCount", "sum"],
  // dateDiff over minIf/maxIf
  ["latency", "avg"],
  // sumMapIf followed by a map subscript
  ["totalTokens", "sum"],
  // sumIf over toNullable
  ["totalCost", "sum"],
  // relation measure: INNER JOIN scores FINAL plus the scores time window
  ["scoresCount", "sum"],
  // the numeric base `uniq(nullIf(user_id, ''))`
  ["uniqueUserIds", "sum"],
  // aggregationOverrides: inner argMaxIf, outer `uniq` under the `count_*`
  // alias; `uniq` renders the same SQL under another alias
  ["uniqueUserIds", "count"],
];

// One per WHERE shape the filter lowering emits.
const FILTERS: ReadonlyArray<[string, Filter]> = [
  ["id =", { column: "id", type: "string", operator: "=", value: "t-1" }],
  // a string column reads '' as missing: `= '' OR IS NULL`
  [
    "id is-null",
    { column: "id", type: "null", operator: "is null", value: "" },
  ],
  // a nullIf(column, '') dimension compares the raw column
  [
    "userId =",
    { column: "userId", type: "string", operator: "=", value: "u-1" },
  ],
  [
    "userId is-null",
    { column: "userId", type: "null", operator: "is null", value: "" },
  ],
  [
    "userId any-of",
    {
      column: "userId",
      type: "stringOptions",
      operator: "any of",
      value: ["u-1", "u-2"],
    },
  ],
  // `name` prunes on its columns: `(trace_name = x OR name = x) AND <trace
  // name> = x`; the OR prunes blocks, the AND keeps the row-level match
  // exact. A `…Name` column falls back to `name` and renders the same SQL as
  // `name` itself.
  [
    "traceName =",
    { column: "traceName", type: "string", operator: "=", value: "chat" },
  ],
  [
    "name contains",
    { column: "name", type: "string", operator: "contains", value: "chat" },
  ],
  // The pruning columns `trace_name` / `name` store a missing name as '', so
  // each compares `= '' OR IS NULL`, like every other string column.
  [
    "name is-null",
    { column: "name", type: "null", operator: "is null", value: "" },
  ],
  [
    "name is-not-null",
    { column: "name", type: "null", operator: "is not null", value: "" },
  ],
  [
    "tags any-of",
    {
      column: "tags",
      type: "arrayOptions",
      operator: "any of",
      value: ["a", "b"],
    },
  ],
  // an array column is missing when empty: `empty(e.tags)`. Like every
  // filter here it tests event rows before the per-trace grouping, so a
  // trace with one untagged event matches `is null`.
  [
    "tags is-null",
    { column: "tags", type: "null", operator: "is null", value: "" },
  ],
  [
    "tags is-not-null",
    { column: "tags", type: "null", operator: "is not null", value: "" },
  ],
  // The only empty array the schema admits (`all of` / `none of`); it binds
  // `[]` and matches every row. Empty stringOptions and empty `any of` are
  // rejected by the query schema before the view is read.
  [
    "tags all-of empty-array",
    { column: "tags", type: "arrayOptions", operator: "all of", value: [] },
  ],
  [
    "start_time >=",
    {
      column: "start_time",
      type: "datetime",
      operator: ">=",
      value: new Date("2026-01-02T00:00:00.000Z"),
    },
  ],
  // stays on events_core
  [
    "metadata = core-safe",
    {
      column: "metadata",
      type: "stringObject",
      key: "region",
      operator: "=",
      value: "eu",
    },
  ],
  // routes the outer events read to events_full; the root-event subquery
  // reads no truncated column and stays on events_core
  ["metadata contains", METADATA_FULL],
  // compares the event's `YYYY-MM` month, `formatDateTime(start_time,
  // '%Y-%m')`, with the value
  [
    "timestampMonth =",
    {
      column: "timestampMonth",
      type: "string",
      operator: "=",
      value: "2026-01",
    },
  ],
];

// Rejected before SQL is built.
const REJECTED_FILTERS: ReadonlyArray<[string, Filter]> = [
  // no numeric metadata lowering on traces
  [
    "metadata numberObject",
    {
      column: "metadata",
      type: "numberObject",
      key: "latency_ms",
      operator: ">",
      value: 200,
    },
  ],
  [
    "metadata contains empty-value",
    {
      column: "metadata",
      type: "stringObject",
      key: "region",
      operator: "contains",
      value: "",
    },
  ],
  [
    "tags stringOptions",
    {
      column: "tags",
      type: "stringOptions",
      operator: "any of",
      value: ["a"],
    },
  ],
  [
    "unknown column",
    { column: "doesNotExist", type: "string", operator: "=", value: "x" },
  ],
];

describeWithClickhouse("golden: executeQuery v2 traces", () => {
  const originalSingleLevel =
    env.LANGFUSE_ENABLE_SINGLE_LEVEL_QUERY_OPTIMIZATION;
  const originalMaxWindowHours =
    env.LANGFUSE_ROOT_EVENT_CONDITION_MAX_WINDOW_HOURS;

  // The env flag ORs into the argument; pin it off so the argument decides.
  // Pin the root-event threshold to its default.
  beforeAll(() => {
    env.LANGFUSE_ENABLE_SINGLE_LEVEL_QUERY_OPTIMIZATION = "false";
    env.LANGFUSE_ROOT_EVENT_CONDITION_MAX_WINDOW_HOURS =
      ROOT_EVENT_MAX_WINDOW_HOURS;
  });
  afterAll(() => {
    env.LANGFUSE_ENABLE_SINGLE_LEVEL_QUERY_OPTIMIZATION = originalSingleLevel;
    env.LANGFUSE_ROOT_EVENT_CONDITION_MAX_WINDOW_HOURS = originalMaxWindowHours;
  });
  beforeEach(resetCaptures);

  describe("levels", () => {
    // count has no `aggs`, so the single-level flag still builds two levels.
    // The 72-hour BASE window keeps the root-event subquery in.
    it("buildEventsTraces level=two-forced singleLevel=true dims=none metrics=count bucket=none", async () => {
      expect(await golden({}, true)).toMatchSnapshot();
    });

    // `count(*) as count` inner and outer.
    it("buildEventsTraces level=two metrics=none", async () => {
      expect(await golden({ metrics: [] })).toMatchSnapshot();
    });

    it("buildEventsTraces level=single metrics=none dims=none", async () => {
      expect(await golden({ metrics: [] }, true)).toMatchSnapshot();
    });

    // The time bucket bare, without the root-event wrapping.
    it("buildEventsTraces level=single metrics=none dims=id bucket=time", async () => {
      expect(
        await golden(
          {
            metrics: [],
            dimensions: [{ field: "id" }],
            timeDimension: { granularity: "day" },
          },
          true,
        ),
      ).toMatchSnapshot();
    });

    it("buildEventsTraces level=single metrics=none bucket=entity field=id", async () => {
      expect(
        await golden({ metrics: [], entityDimension: { field: "id" } }, true),
      ).toMatchSnapshot();
    });
  });

  describe("dimensions", () => {
    // Inner reads the per-trace value, `any(e.trace_id)` for `id`.
    it.each(["id", "name", "tags", "userId", "timestampMonth"])(
      "buildEventsTraces level=two dim=%s",
      async (field) => {
        expect(await golden({ dimensions: [{ field }] })).toMatchSnapshot();
      },
    );
  });

  describe("measures", () => {
    it.each(MEASURES)(
      "buildEventsTraces measure=%s agg=%s",
      async (measure, aggregation) => {
        expect(
          await golden({ metrics: [{ measure, aggregation }] }),
        ).toMatchSnapshot();
      },
    );

    // Without FINAL the scores join drops tombstone rows (`is_deleted = 0`).
    it("buildEventsTraces measure=scoresCount skipScoresFinal=true", async () => {
      vi.mocked(shouldSkipScoresDedup).mockReturnValueOnce(true);
      expect(
        await golden({
          metrics: [{ measure: "scoresCount", aggregation: "sum" }],
        }),
      ).toMatchSnapshot();
    });
  });

  describe("aggregations", () => {
    // Parametric aggregates over the per-trace inner alias.
    it.each(["p95", "histogram"] as const)(
      "buildEventsTraces agg=%s bins=25",
      async (aggregation) => {
        expect(
          await golden({
            metrics: [{ measure: "latency", aggregation }],
            chartConfig: { type: "HISTOGRAM", bins: 25 },
          }),
        ).toMatchSnapshot();
      },
    );
  });

  describe("bucketing", () => {
    // Two-level inner time is
    // `ifNull(anyIf(toNullable(<bucket>), <root cond>), min(<bucket>))`,
    // traces-only, so each granularity's bucket inside it gets a case.
    it.each(granularities.options.filter((g) => g !== "auto"))(
      "buildEventsTraces bucket=time granularity=%s",
      async (granularity) => {
        expect(
          await golden({ timeDimension: { granularity } }),
        ).toMatchSnapshot();
      },
    );

    // A given ORDER BY drops WITH FILL.
    it("buildEventsTraces bucket=time orderBy=given", async () => {
      expect(
        await golden({
          timeDimension: { granularity: "day" },
          orderBy: [{ field: "count_count", direction: "desc" }],
        }),
      ).toMatchSnapshot();
    });

    // A fill bound before 1970 overflows the 32-bit DateTime bucket, so
    // WITH FILL is dropped.
    it("buildEventsTraces bucket=time fill=skipped-overflow", async () => {
      expect(
        await golden({
          timeDimension: { granularity: "day" },
          fromTimestamp: "1969-12-31T00:00:00.000Z",
          toTimestamp: "1970-01-02T00:00:00.000Z",
        }),
      ).toMatchSnapshot();
    });

    // `any(trace_id) as entity_dimension`.
    it("buildEventsTraces bucket=entity field=id level=two", async () => {
      expect(
        await golden({ entityDimension: { field: "id" } }),
      ).toMatchSnapshot();
    });

    // Dimensions with an `aggregationFunction` cannot be the entity.
    it("buildEventsTraces bucket=entity field=name throws", async () => {
      await expect(
        golden({ entityDimension: { field: "name" } }),
      ).rejects.toThrowErrorMatchingSnapshot();
    });
  });

  describe("filters", () => {
    it.each(FILTERS)("buildEventsTraces filter=%s", async (_name, filter) => {
      expect(await golden({ filters: [filter] })).toMatchSnapshot();
    });

    // The `name` filter's conjuncts follow the time window, a normal
    // filter's precede it.
    it("buildEventsTraces filters=name,environment", async () => {
      expect(
        await golden({
          filters: [
            { column: "name", type: "string", operator: "=", value: "chat" },
            {
              column: "environment",
              type: "string",
              operator: "=",
              value: "prod",
            },
          ],
        }),
      ).toMatchSnapshot();
    });

    it.each(REJECTED_FILTERS)(
      "buildEventsTraces filter=%s throws",
      async (_name, filter) => {
        await expect(
          golden({ filters: [filter] }),
        ).rejects.toThrowErrorMatchingSnapshot();
      },
    );
  });

  describe("other clauses", () => {
    it("buildEventsTraces row_limit via chartConfig", async () => {
      expect(
        await golden({
          dimensions: [{ field: "name" }],
          chartConfig: { type: "TABLE", row_limit: 50 },
        }),
      ).toMatchSnapshot();
    });

    it("buildEventsTraces row_limit via config", async () => {
      // The public v2 metrics API passes chart settings under `config`.
      await executeQuery(
        PROJECT,
        {
          ...BASE,
          dimensions: [{ field: "name" }],
          ...{ config: { type: "TABLE", row_limit: 25 } },
        },
        "v2",
        false,
      );
      expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
    });

    it("buildEventsTraces orderBy=dimension", async () => {
      expect(
        await golden({
          dimensions: [{ field: "name" }],
          orderBy: [{ field: "name", direction: "asc" }],
        }),
      ).toMatchSnapshot();
    });
  });

  describe("crosses", () => {
    it("buildEventsTraces measure=scoresCount bucket=time", async () => {
      expect(
        await golden({
          timeDimension: { granularity: "day" },
          metrics: [{ measure: "scoresCount", aggregation: "sum" }],
        }),
      ).toMatchSnapshot();
    });

    it("buildEventsTraces filter=metadata-full bucket=time level=two", async () => {
      expect(
        await golden({
          timeDimension: { granularity: "day" },
          filters: [METADATA_FULL],
        }),
      ).toMatchSnapshot();
    });
  });
});

// The window gate is `<=`: a window of exactly the threshold keeps the
// subquery. Same SQL as below the threshold, so no golden.
describe("executeQuery v2 traces root-event window boundary", () => {
  const originalMaxWindowHours =
    env.LANGFUSE_ROOT_EVENT_CONDITION_MAX_WINDOW_HOURS;
  afterAll(() => {
    env.LANGFUSE_ROOT_EVENT_CONDITION_MAX_WINDOW_HOURS = originalMaxWindowHours;
  });
  beforeEach(resetCaptures);

  it.each([
    ["at-threshold", "2026-01-08T00:00:00.000Z", true],
    ["above-threshold", "2026-01-08T00:00:00.001Z", false],
  ] as const)("rootEvent=%s", async (_name, toTimestamp, applied) => {
    env.LANGFUSE_ROOT_EVENT_CONDITION_MAX_WINDOW_HOURS =
      ROOT_EVENT_MAX_WINDOW_HOURS;
    await executeQuery(PROJECT, { ...BASE, toTimestamp }, "v2", false);
    expect(capturedQueries).toHaveLength(1);
    expect(/not exists/i.test(capturedQueries[0].query)).toBe(applied);
  });
});
