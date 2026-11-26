// Golden SQL for the v2 score views (`scores-numeric`, `scores-categorical`,
// `scores-boolean` and the internal `scores-listable-count`), driven through
// `executeQuery(..., "v2", singleLevel)` so the chartConfig/config threading
// into QueryBuilder is pinned as prod sees it.
//
// Cases cover query shapes, not query inputs: one case per distinct SQL
// structure (single- vs two-level, the `events_traces` trace-attributes join
// vs its filter-only semi-join, the `events_observations` join, WITH FILL,
// GROUP BY/ORDER BY/LIMIT placement, FINAL), each WHERE template the filter
// mapping emits, every granularity and every aggregation. The full matrix runs
// on `scores-numeric`; the other views differ only in alias, segment and their
// own value dimension, so they get a minimal case plus that dimension.
//
// Level: score views ignore the single-level flag. A query is single-level iff
// no relation join remains after the semi-join split, so a join (not the flag)
// makes it two-level. Cases pass `singleLevel=false` unless they pin that.
//
// Not reachable on these views, so no case: ARRAY JOIN (`explodeArray`,
// `pairExpand`), `aggregationFunction` dimensions, `filterSql` raw WHERE parts,
// the `rootEventCondition` subquery, the events_core -> events_full switch
// (base table is `scores`) and the ngram/FTS filter branches (score views
// filter the joined relations without index prefilters). The `*Name` filter
// fallback (`fooName` -> `name`) renders the `name=` SQL.
//
// Legacy oddity pinned throughout: no `is_deleted` predicate anywhere, the
// column is never written.
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
import {
  granularities,
  metricAggregations,
  SCORES_LISTABLE_COUNT_VIEW,
  type QueryType,
} from "../types";
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
const TO_7D = "2026-01-08T00:00:00.000Z";

type Filter = QueryType["filters"][number];

const BASE: QueryType = {
  view: "scores-numeric",
  dimensions: [],
  metrics: [{ measure: "count", aggregation: "count" }],
  filters: [],
  timeDimension: null,
  fromTimestamp: FROM,
  toTimestamp: TO_7D,
  orderBy: null,
};

/** Runs one v2 score query through the exec mock; returns the golden. */
async function golden(overrides: Partial<QueryType>, singleLevel = false) {
  await executeQuery(PROJECT, { ...BASE, ...overrides }, "v2", singleLevel);
  return normalizeCapturedQueries(capturedQueries);
}

const describeWithClickhouse = clickhouseFormatAvailable()
  ? describe
  : describe.skip;

if (!clickhouseFormatAvailable()) {
  console.warn(
    "[golden-harness] `clickhouse format` unavailable — skipping golden SQL tests. Install clickhouse-local to run them.",
  );
}

// A trace-attributes dimension: joins `events_traces`, forcing two-level.
const TRACE_DIM = { field: "traceName" };
// An observation dimension: joins `events_observations`, forcing two-level.
const OBS_DIM = { field: "observationName" };

const VALUE_AVG = { measure: "value", aggregation: "avg" } as const;

// One per WHERE template the filter mapping emits on the scores table.
const FILTERS: ReadonlyArray<[string, Filter]> = [
  [
    "string name=",
    { column: "name", type: "string", operator: "=", value: "accuracy" },
  ],
  [
    "string name contains",
    { column: "name", type: "string", operator: "contains", value: "acc" },
  ],
  // Negated string operators add a `!= ''` guard.
  [
    "string name does-not-contain",
    {
      column: "name",
      type: "string",
      operator: "does not contain",
      value: "acc",
    },
  ],
  [
    "string name starts-with",
    { column: "name", type: "string", operator: "starts with", value: "acc" },
  ],
  [
    "string name ends-with",
    { column: "name", type: "string", operator: "ends with", value: "acy" },
  ],
  [
    "string name is-not-empty",
    { column: "name", type: "string", operator: "is not empty", value: "" },
  ],
  // The `*Name` fallback: an unknown `fooName` column resolves to the `name`
  // dimension, so it renders the `name=` SQL; pins the branch.
  [
    "string scoreName= fallback",
    { column: "scoreName", type: "string", operator: "=", value: "accuracy" },
  ],
  [
    "stringOptions source any-of",
    {
      column: "source",
      type: "stringOptions",
      operator: "any of",
      value: ["API", "EVAL"],
    },
  ],
  [
    "stringOptions source none-of",
    {
      column: "source",
      type: "stringOptions",
      operator: "none of",
      value: ["ANNOTATION"],
    },
  ],
  // `datasetRunId` is `nullIf(…, '')`: `= ''` also matches NULL.
  [
    "string nullIf datasetRunId= empty",
    { column: "datasetRunId", type: "string", operator: "=", value: "" },
  ],
  // '' among the options adds an IS NULL / IS NOT NULL guard.
  [
    "stringOptions nullIf datasetRunId any-of with empty",
    {
      column: "datasetRunId",
      type: "stringOptions",
      operator: "any of",
      value: ["", "run-1"],
    },
  ],
  [
    "stringOptions nullIf datasetRunId none-of with empty",
    {
      column: "datasetRunId",
      type: "stringOptions",
      operator: "none of",
      value: ["", "run-1"],
    },
  ],
  [
    "string nullIf datasetRunId does-not-contain",
    {
      column: "datasetRunId",
      type: "string",
      operator: "does not contain",
      value: "run",
    },
  ],
  [
    "string nullIf datasetRunId is-not-empty",
    {
      column: "datasetRunId",
      type: "string",
      operator: "is not empty",
      value: "",
    },
  ],
  [
    "null nullIf datasetRunId is-null",
    { column: "datasetRunId", type: "null", operator: "is null", value: "" },
  ],
  [
    "number value>=",
    { column: "value", type: "number", operator: ">=", value: 0.5 },
  ],
  // Filters on the `toBool(metadata[…] = 'true')` dimension expression.
  [
    "boolean isEvaluatorTest=",
    { column: "isEvaluatorTest", type: "boolean", operator: "=", value: true },
  ],
  [
    "boolean isEvaluatorTest<>",
    {
      column: "isEvaluatorTest",
      type: "boolean",
      operator: "<>",
      value: true,
    },
  ],
  [
    "datetime timestamp>=",
    {
      column: "timestamp",
      type: "datetime",
      operator: ">=",
      value: new Date("2026-01-03T00:00:00.000Z"),
    },
  ],
  [
    "null environment is-null",
    { column: "environment", type: "null", operator: "is null", value: "" },
  ],
  // `null` on the `tags` array (a trace attribute, so a semi-join) tests
  // emptiness, since ClickHouse arrays are never NULL.
  [
    "null tags is-null",
    { column: "tags", type: "null", operator: "is null", value: "" },
  ],
  [
    "null tags is-not-null",
    { column: "tags", type: "null", operator: "is not null", value: "" },
  ],
  [
    "null environment is-not-null",
    {
      column: "environment",
      type: "null",
      operator: "is not null",
      value: "",
    },
  ],
  [
    "stringObject metadata=",
    {
      column: "metadata",
      type: "stringObject",
      key: "region",
      operator: "=",
      value: "eu",
    },
  ],
  [
    "stringObject metadata contains",
    {
      column: "metadata",
      type: "stringObject",
      key: "region",
      operator: "contains",
      value: "eu",
    },
  ],
  ...(
    [
      "does not contain",
      "starts with",
      "ends with",
      "is set",
      "is not set",
    ] as const
  ).map((operator): [string, Filter] => [
    `stringObject metadata ${operator.replaceAll(" ", "-")}`,
    {
      column: "metadata",
      type: "stringObject",
      key: "region",
      operator,
      value: operator.startsWith("is") ? "" : "eu",
    },
  ]),
];

// `tags` is an `events_traces` column: filter-only, so each renders the
// trace-attributes semi-join and stays single-level.
const TAG_FILTERS: ReadonlyArray<[string, Filter]> = [
  [
    "any-of",
    {
      column: "tags",
      type: "arrayOptions",
      operator: "any of",
      value: ["a", "b"],
    },
  ],
  [
    "all-of",
    {
      column: "tags",
      type: "arrayOptions",
      operator: "all of",
      value: ["a", "b"],
    },
  ],
  [
    "none-of",
    {
      column: "tags",
      type: "arrayOptions",
      operator: "none of",
      value: ["a"],
    },
  ],
  // The only empty array the schema admits (a pending selection): renders the
  // `all-of` SQL and binds `[]`, kept as the empty-input case. Empty
  // stringOptions and empty `any of` are rejected before SQL.
  [
    "all-of empty-array",
    { column: "tags", type: "arrayOptions", operator: "all of", value: [] },
  ],
];

describeWithClickhouse("golden: executeQuery v2 scores", () => {
  const originalSingleLevel =
    env.LANGFUSE_ENABLE_SINGLE_LEVEL_QUERY_OPTIMIZATION;

  // The env flag ORs into the argument; pin it off so the argument decides.
  beforeAll(() => {
    env.LANGFUSE_ENABLE_SINGLE_LEVEL_QUERY_OPTIMIZATION = "false";
  });
  afterAll(() => {
    env.LANGFUSE_ENABLE_SINGLE_LEVEL_QUERY_OPTIMIZATION = originalSingleLevel;
  });
  beforeEach(resetCaptures);

  describe("views", () => {
    // Alias, segment and FINAL per view: numeric and listable-count segment
    // with `any of`, categorical and boolean with `=`.
    it.each([
      "scores-numeric",
      "scores-categorical",
      "scores-boolean",
      SCORES_LISTABLE_COUNT_VIEW,
    ] as const)("build view=%s bucket=none", async (view) => {
      expect(await golden({ view })).toMatchSnapshot();
    });

    it("build skipScoresFinal=true", async () => {
      vi.mocked(shouldSkipScoresDedup).mockReturnValue(true);
      try {
        expect(await golden({})).toMatchSnapshot();
      } finally {
        vi.mocked(shouldSkipScoresDedup).mockReturnValue(false);
      }
    });

    // The scored-ids prefilter already reads scores without FINAL; the base
    // table loses it too.
    it("build skipScoresFinal=true join=events_traces", async () => {
      vi.mocked(shouldSkipScoresDedup).mockReturnValue(true);
      try {
        expect(await golden({ dimensions: [TRACE_DIM] })).toMatchSnapshot();
      } finally {
        vi.mocked(shouldSkipScoresDedup).mockReturnValue(false);
      }
    });
  });

  describe("dimensions", () => {
    it("build level=single dims=all-score-specific", async () => {
      expect(
        await golden({
          dimensions: [
            "id",
            "environment",
            "name",
            "evaluatorId",
            "ruleId",
            "isEvaluatorTest",
            "source",
            "dataType",
            "traceId",
            "configId",
            "timestampMonth",
            "timestampDay",
            "observationId",
            "sessionId",
            "datasetRunId",
            "value",
          ].map((field) => ({ field })),
        }),
      ).toMatchSnapshot();
    });

    it("build view=scores-categorical dim=stringValue", async () => {
      expect(
        await golden({
          view: "scores-categorical",
          dimensions: [{ field: "stringValue" }],
        }),
      ).toMatchSnapshot();
    });

    it("build view=scores-boolean dim=booleanValue", async () => {
      expect(
        await golden({
          view: "scores-boolean",
          dimensions: [{ field: "booleanValue" }],
        }),
      ).toMatchSnapshot();
    });

    // All five trace-attributes subquery columns; the `nullIf` dimensions.
    it("build join=events_traces dims=traceName,userId,tags,traceRelease,traceVersion", async () => {
      expect(
        await golden({
          dimensions: [
            "traceName",
            "userId",
            "tags",
            "traceRelease",
            "traceVersion",
          ].map((field) => ({ field })),
        }),
      ).toMatchSnapshot();
    });

    it("build join=events_observations dims=all-observation", async () => {
      expect(
        await golden({
          dimensions: [
            "observationName",
            "observationModelName",
            "observationPromptName",
            "observationPromptVersion",
            "experimentName",
            "experimentId",
          ].map((field) => ({ field })),
        }),
      ).toMatchSnapshot();
    });

    // The dashboard router's score-table shape.
    it("build dims=name,source,dataType metrics=count,value", async () => {
      expect(
        await golden({
          dimensions: [
            { field: "name" },
            { field: "source" },
            { field: "dataType" },
          ],
          metrics: [{ measure: "count", aggregation: "count" }, VALUE_AVG],
        }),
      ).toMatchSnapshot();
    });
  });

  describe("joins", () => {
    // Joins follow first use: entity bucket, dimensions, metrics, filters.
    it("build join=events_observations,events_traces dims=observationName,traceName", async () => {
      expect(
        await golden({ dimensions: [OBS_DIM, TRACE_DIM] }),
      ).toMatchSnapshot();
    });

    // The view alias in a two-level join query on a non-numeric view.
    it("build view=scores-categorical join=events_traces", async () => {
      expect(
        await golden({ view: "scores-categorical", dimensions: [TRACE_DIM] }),
      ).toMatchSnapshot();
    });

    // One semi-join subquery carrying both trace filters. `userId = ''`
    // selects traces without a user: `events_traces.user_id` is an argMaxIf
    // over a non-nullable String, never NULL, so the `IS NULL` disjunct the
    // empty-equals-null guard adds is dead here. Harmless, so the baseline
    // pins it.
    it("build semi-join filters=userId,tags", async () => {
      expect(
        await golden({
          filters: [
            { column: "userId", type: "string", operator: "=", value: "" },
            {
              column: "tags",
              type: "arrayOptions",
              operator: "any of",
              value: ["a"],
            },
          ],
        }),
      ).toMatchSnapshot();
    });

    // A score filter next to a semi-join: the scored-ids prefilter carries it.
    it("build semi-join filters=name,userId", async () => {
      expect(
        await golden({
          filters: [
            {
              column: "name",
              type: "string",
              operator: "=",
              value: "accuracy",
            },
            { column: "userId", type: "string", operator: "=", value: "u1" },
          ],
        }),
      ).toMatchSnapshot();
    });

    // The semi-join inside the inner WHERE of a two-level query.
    it("build semi-join filter=traceName dim=observationName", async () => {
      expect(
        await golden({
          dimensions: [OBS_DIM],
          filters: [
            {
              column: "traceName",
              type: "string",
              operator: "=",
              value: "chat",
            },
          ],
        }),
      ).toMatchSnapshot();
    });

    // With the trace join present the trace filter stays in the outer WHERE;
    // the subquery selects `name` and `user_id`.
    it("build join=events_traces dim=traceName filter=userId", async () => {
      expect(
        await golden({
          dimensions: [TRACE_DIM],
          filters: [
            { column: "userId", type: "string", operator: "=", value: "u1" },
          ],
        }),
      ).toMatchSnapshot();
    });

    // Score filters are copied into the scored-ids prefilter. Legacy oddity:
    // that prefilter reads scores without FINAL (it only narrows trace ids).
    it("build join=events_traces dim=traceName filters=name,metadata", async () => {
      expect(
        await golden({
          dimensions: [TRACE_DIM],
          filters: [
            {
              column: "name",
              type: "string",
              operator: "=",
              value: "accuracy",
            },
            {
              column: "metadata",
              type: "stringObject",
              key: "region",
              operator: "=",
              value: "eu",
            },
          ],
        }),
      ).toMatchSnapshot();
    });

    // A relation filter is not copied into the scored-ids prefilter.
    it("build join=events_traces dim=traceName filter=observationName", async () => {
      expect(
        await golden({
          dimensions: [TRACE_DIM],
          filters: [
            {
              column: "observationName",
              type: "string",
              operator: "=",
              value: "llm",
            },
          ],
        }),
      ).toMatchSnapshot();
    });

    // Legacy oddity: the inner select emits two `any(scores.value) AS value`
    // columns, the `value` dimension and the `value` measure input.
    // ClickHouse accepts the duplicate; pinned as rendered.
    it("build level=two dim=value measure=value", async () => {
      expect(
        await golden({
          dimensions: [TRACE_DIM, { field: "value" }],
          metrics: [VALUE_AVG],
        }),
      ).toMatchSnapshot();
    });

    // The flag is ignored: a join still renders two-level.
    it("build singleLevel=true join=events_observations", async () => {
      expect(await golden({ dimensions: [OBS_DIM] }, true)).toMatchSnapshot();
    });
  });

  describe("bucketing", () => {
    // Bucket expression and WITH FILL step of each granularity.
    it.each(granularities.options.filter((g) => g !== "auto"))(
      "build bucket=time granularity=%s",
      async (granularity) => {
        expect(
          await golden({ timeDimension: { granularity } }),
        ).toMatchSnapshot();
      },
    );

    it("build level=two bucket=time", async () => {
      expect(
        await golden({
          timeDimension: { granularity: "hour" },
          dimensions: [TRACE_DIM],
        }),
      ).toMatchSnapshot();
    });

    // A given ORDER BY drops WITH FILL; two items, one matched as the bucket
    // alias and one as a metric.
    it("build bucket=time orderBy=time_dimension,metric", async () => {
      expect(
        await golden({
          timeDimension: { granularity: "day" },
          orderBy: [
            { field: "time_dimension", direction: "desc" },
            { field: "count_count", direction: "desc" },
          ],
        }),
      ).toMatchSnapshot();
    });

    // A fill bound before 1970 overflows the 32-bit DateTime bucket, so
    // WITH FILL is dropped.
    it("build bucket=time fill=skipped-overflow", async () => {
      expect(
        await golden({
          timeDimension: { granularity: "day" },
          fromTimestamp: "1969-12-31T00:00:00.000Z",
        }),
      ).toMatchSnapshot();
    });

    it("build bucket=entity field=datasetRunId", async () => {
      expect(
        await golden({ entityDimension: { field: "datasetRunId" } }),
      ).toMatchSnapshot();
    });

    // The relation comes from the entity bucket alone.
    it("build bucket=entity field=experimentId", async () => {
      expect(
        await golden({ entityDimension: { field: "experimentId" } }),
      ).toMatchSnapshot();
    });

    it("build bucket=entity field=traceName", async () => {
      expect(
        await golden({ entityDimension: { field: "traceName" } }),
      ).toMatchSnapshot();
    });

    it("build bucket=entity field=datasetRunId metrics=none", async () => {
      expect(
        await golden({
          entityDimension: { field: "datasetRunId" },
          metrics: [],
        }),
      ).toMatchSnapshot();
    });

    it("build bucket=time,entity throws", async () => {
      await expect(
        golden({
          timeDimension: { granularity: "day" },
          entityDimension: { field: "datasetRunId" },
        }),
      ).rejects.toThrowErrorMatchingSnapshot();
    });
  });

  describe("aggregations", () => {
    // Single-level drops the `@@AGG1@@` slot: `<aggregation>(scores.value)`.
    it.each(metricAggregations.options)(
      "build level=single measure=value agg=%s",
      async (aggregation) => {
        expect(
          await golden({ metrics: [{ measure: "value", aggregation }] }),
        ).toMatchSnapshot();
      },
    );

    // Parametric aggregates over the inner alias.
    it.each(["p95", "histogram"] as const)(
      "build level=two measure=value agg=%s",
      async (aggregation) => {
        expect(
          await golden({
            dimensions: [TRACE_DIM],
            metrics: [{ measure: "value", aggregation }],
            chartConfig: { type: "HISTOGRAM", bins: 25 },
          }),
        ).toMatchSnapshot();
      },
    );

    it("build agg=histogram chartConfig.bins=25", async () => {
      expect(
        await golden({
          metrics: [{ measure: "value", aggregation: "histogram" }],
          chartConfig: { type: "HISTOGRAM", bins: 25 },
        }),
      ).toMatchSnapshot();
    });

    it("build level=single metrics=none", async () => {
      expect(await golden({ metrics: [] })).toMatchSnapshot();
    });

    it("build level=two metrics=none", async () => {
      expect(
        await golden({ dimensions: [TRACE_DIM], metrics: [] }),
      ).toMatchSnapshot();
    });
  });

  describe("filters", () => {
    it.each(FILTERS)("build filter=%s", async (_name, filter) => {
      expect(await golden({ filters: [filter] })).toMatchSnapshot();
    });

    it.each(TAG_FILTERS)(
      "build semi-join filter=arrayOptions tags %s",
      async (_name, filter) => {
        expect(await golden({ filters: [filter] })).toMatchSnapshot();
      },
    );

    it("build view=scores-boolean filter=boolean booleanValue=", async () => {
      expect(
        await golden({
          view: "scores-boolean",
          filters: [
            {
              column: "booleanValue",
              type: "boolean",
              operator: "=",
              value: true,
            },
          ],
        }),
      ).toMatchSnapshot();
    });

    // `nullIf` on a relation column: the IS NULL guard carries the relation
    // prefix.
    it("build join=events_observations filter=stringOptions observationModelName any-of with empty", async () => {
      expect(
        await golden({
          filters: [
            {
              column: "observationModelName",
              type: "stringOptions",
              operator: "any of",
              value: ["", "gpt-4o"],
            },
          ],
        }),
      ).toMatchSnapshot();
    });

    it("build join=events_observations filter=number observationPromptVersion>=", async () => {
      expect(
        await golden({
          filters: [
            {
              column: "observationPromptVersion",
              type: "number",
              operator: ">=",
              value: 2,
            },
          ],
        }),
      ).toMatchSnapshot();
    });

    it("build join=events_observations filter=null observationName is-null", async () => {
      expect(
        await golden({
          filters: [
            {
              column: "observationName",
              type: "null",
              operator: "is null",
              value: "",
            },
          ],
        }),
      ).toMatchSnapshot();
    });

    it("build filter=string on number value throws", async () => {
      await expect(
        golden({
          filters: [
            { column: "value", type: "string", operator: "=", value: "1" },
          ],
        }),
      ).rejects.toThrowErrorMatchingSnapshot();
    });

    // Neither a dimension, the time dimension, `metadata` nor `*Name`.
    it("build filter=invalid column throws", async () => {
      await expect(
        golden({
          filters: [
            { column: "unknown", type: "string", operator: "=", value: "x" },
          ],
        }),
      ).rejects.toThrowErrorMatchingSnapshot();
    });

    // Rejected by the zod refine on `stringOptionsFilter`.
    it("build filter=stringOptions source any-of empty throws", async () => {
      await expect(
        golden({
          filters: [
            {
              column: "source",
              type: "stringOptions",
              operator: "any of",
              value: [],
            },
          ],
        }),
      ).rejects.toThrowErrorMatchingSnapshot();
    });

    it("build filter=stringOptions on array tags throws", async () => {
      await expect(
        golden({
          filters: [
            {
              column: "tags",
              type: "stringOptions",
              operator: "any of",
              value: ["a"],
            },
          ],
        }),
      ).rejects.toThrowErrorMatchingSnapshot();
    });
  });

  describe("other clauses", () => {
    // `chartConfig.row_limit` renders the same SQL; the two-level case below
    // threads it.
    it("build row_limit via config", async () => {
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

    // WITH FILL then LIMIT, both after the outer GROUP BY.
    it("build level=two bucket=time row_limit via chartConfig", async () => {
      expect(
        await golden({
          timeDimension: { granularity: "day" },
          dimensions: [TRACE_DIM],
          chartConfig: { type: "LINE_TIME_SERIES", row_limit: 50 },
        }),
      ).toMatchSnapshot();
    });

    it("build orderBy=dimension,metric", async () => {
      expect(
        await golden({
          dimensions: [{ field: "name" }],
          orderBy: [
            { field: "name", direction: "asc" },
            { field: "count_count", direction: "desc" },
          ],
        }),
      ).toMatchSnapshot();
    });

    // The field matches the view's `sql` string of the dimension, not its
    // alias.
    it("build orderBy=dimension via dim.sql", async () => {
      expect(
        await golden({
          dimensions: [{ field: "name" }],
          orderBy: [{ field: "scores_numeric.name", direction: "asc" }],
        }),
      ).toMatchSnapshot();
    });

    it("build defaultOrder dims-only metrics=none", async () => {
      expect(
        await golden({ dimensions: [{ field: "name" }], metrics: [] }),
      ).toMatchSnapshot();
    });
  });
});
