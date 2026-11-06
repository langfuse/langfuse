// Golden SQL for the v2 observations dashboard view (`eventsObservationsView`,
// `events_core events_observations`), driven through `executeQuery(..., "v2",
// singleLevel)` so the chartConfig/config threading into QueryBuilder is pinned
// as prod sees it.
//
// Cases cover query shapes, not query inputs: one case per distinct SQL
// structure (clauses, subquery nesting, JOIN and ARRAY JOIN, WITH FILL,
// GROUP BY/ORDER BY/LIMIT placement, events_core vs events_full, and each
// expression template the builder treats differently, such as an `@@AGG@@`
// placeholder inside a lambda). Inputs that only change a column name, a
// function name or a literal inside an otherwise identical query are not new
// shapes and get no case: other dimensions and measures of the same kind,
// other aggregation functions and granularities of the same template, `auto`
// granularity (resolved to a fixed one before SQL is built), filter columns
// sharing an operator template. Cases that throw before SQL is built assert
// the error instead.
//
// Not reachable on this view, so no case: the `rootEventCondition` subquery
// (only `events_traces`), `filterSql` raw WHERE parts, `aggregationFunction`
// dimensions, the observations FINAL skip, and the `events-observations` view
// name branch (this view is named `events_observations`).
//
// Legacy oddities, pinned as today's behaviour (each also noted at its case):
// - WHERE, GROUP BY, the time bucket and the two-level inner SELECT qualify
//   columns with the table name (`events_core.` / `events_full.`) while FROM
//   aliases the table `events_observations`. Every SQL case pins it.
// - Token and cost measures read bare `usage_details` / `total_cost` while
//   other columns are qualified. `inputCost` / `outputCost` (bare
//   `cost_details`) share the `inputTokens` template and have no case.
// - The scores join has no `is_deleted = 0`; without FINAL it counts scores
//   whose latest version is deleted.
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
import type { QueryType } from "../types";
import {
  capturedQueries,
  clickhouseFormatAvailable,
  normalizeCapturedQueries,
  resetCaptures,
} from "../../../server/repositories/goldenHarness";

// Record the exec seam instead of hitting ClickHouse.
vi.mock("../../../server/repositories/clickhouse", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../server/repositories/clickhouse")
    >();
  const { buildClickhouseMock } =
    await import("../../../server/repositories/goldenHarness.js");
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
  view: "observations",
  dimensions: [],
  metrics: [{ measure: "count", aggregation: "count" }],
  filters: [],
  timeDimension: null,
  fromTimestamp: FROM,
  toTimestamp: TO_7D,
  orderBy: null,
};

/** Runs one v2 observations query through the exec mock; returns the golden. */
async function golden(overrides: Partial<QueryType>, singleLevel = true) {
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

// One measure per way its SQL template interacts with `@@AGG@@` substitution
// (two-level) and stripping (single-level), each at its natural aggregation.
const MEASURES: ReadonlyArray<
  [string, QueryType["metrics"][number]["aggregation"]]
> = [
  // `@@AGG@@(1)`: one placeholder over a constant
  ["count", "count"],
  // the same placeholder twice inside a scalar function
  ["latency", "avg"],
  // placeholder inside a `mapFilter` lambda; reads bare `usage_details`
  // (legacy, pinned)
  ["inputTokens", "sum"],
  // `sumMap` placeholder followed by a map subscript; bare `usage_details`
  // (legacy, pinned)
  ["totalTokens", "sum"],
  // two different placeholders; bare `usage_details` (legacy, pinned)
  ["tokensPerSecond", "avg"],
  // relation measure without aggs: joins scores, forces two-level
  ["countScores", "sum"],
  // requiresDimension: auto-includes the explodeArray dimension it reads
  ["toolCallInvocations", "sum"],
  // requiresDimension: auto-includes the pairExpand ARRAY JOIN, bare alias
  ["costByType", "sum"],
];

// Single-level count is `bucket=none`; countScores is never single-level
// (`level=two-forced`).
const SINGLE_LEVEL_MEASURES = MEASURES.filter(
  ([measure]) => measure !== "count" && measure !== "countScores",
);

// countScores renders the same SQL with either flag; `level=two-forced` has it.
const TWO_LEVEL_MEASURES = MEASURES.filter(
  ([measure]) => measure !== "countScores",
);

// One per WHERE template the filter mapping emits.
const FILTERS: ReadonlyArray<[string, Filter]> = [
  [
    "string plain type=",
    { column: "type", type: "string", operator: "=", value: "GENERATION" },
  ],
  // `name` adds a lower() conjunct; `scoreName` falls back to `name`.
  [
    "string name= via scoreName fallback",
    { column: "scoreName", type: "string", operator: "=", value: "accuracy" },
  ],
  [
    "string name contains",
    { column: "name", type: "string", operator: "contains", value: "chat" },
  ],
  [
    "stringOptions plain type any-of",
    {
      column: "type",
      type: "stringOptions",
      operator: "any of",
      value: ["GENERATION", "SPAN"],
    },
  ],
  // ngram column: adds a lower() IN conjunct
  [
    "stringOptions name any-of",
    {
      column: "name",
      type: "stringOptions",
      operator: "any of",
      value: ["chat", "embed"],
    },
  ],
  [
    "stringOptions plain type none-of",
    {
      column: "type",
      type: "stringOptions",
      operator: "none of",
      value: ["EVENT"],
    },
  ],
  [
    "stringOptions nullIf environment none-of",
    {
      column: "environment",
      type: "stringOptions",
      operator: "none of",
      value: ["dev"],
    },
  ],
  // '' among the options adds an IS NULL / IS NOT NULL guard.
  [
    "stringOptions nullIf environment any-of with empty",
    {
      column: "environment",
      type: "stringOptions",
      operator: "any of",
      value: ["", "prod"],
    },
  ],
  [
    "stringOptions nullIf environment none-of with empty",
    {
      column: "environment",
      type: "stringOptions",
      operator: "none of",
      value: ["", "dev"],
    },
  ],
  // `= ''` also matches NULL.
  [
    "string nullIf environment= empty",
    { column: "environment", type: "string", operator: "=", value: "" },
  ],
  // Negated string operators add a `!= ''` guard.
  [
    "string nullIf environment does-not-contain",
    {
      column: "environment",
      type: "string",
      operator: "does not contain",
      value: "dev",
    },
  ],
  [
    "arrayOptions tags any-of",
    {
      column: "tags",
      type: "arrayOptions",
      operator: "any of",
      value: ["a", "b"],
    },
  ],
  [
    "arrayOptions tags all-of",
    {
      column: "tags",
      type: "arrayOptions",
      operator: "all of",
      value: ["a", "b"],
    },
  ],
  [
    "number promptVersion>=",
    { column: "promptVersion", type: "number", operator: ">=", value: 2 },
  ],
  [
    "boolean isRootObservation=",
    {
      column: "isRootObservation",
      type: "boolean",
      operator: "=",
      value: true,
    },
  ],
  [
    "datetime start_time>=",
    {
      column: "start_time",
      type: "datetime",
      operator: ">=",
      value: new Date("2026-01-03T00:00:00.000Z"),
    },
  ],
  [
    "null environment is-null",
    { column: "environment", type: "null", operator: "is null", value: "" },
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
  // stays on events_core
  [
    "metadata core-safe =",
    {
      column: "metadata",
      type: "stringObject",
      key: "region",
      operator: "=",
      value: "eu",
    },
  ],
  // rewrites the base table to events_full; WHERE then reads `events_full.`
  // under the `events_observations` alias (legacy, pinned)
  [
    "metadata full contains",
    {
      column: "metadata",
      type: "stringObject",
      key: "region",
      operator: "contains",
      value: "eu",
    },
  ],
];

describeWithClickhouse("golden: executeQuery v2 observations", () => {
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

  describe("bucketing", () => {
    // WHERE reads `events_core.` though FROM aliases `events_observations`
    // (legacy, pinned).
    it("build bucket=none", async () => {
      expect(await golden({})).toMatchSnapshot();
    });

    // `toDate(...)` and `toStartOfInterval(..., INTERVAL n ...)` templates.
    it.each(["day", "5m"] as const)(
      "build bucket=time granularity=%s",
      async (granularity) => {
        expect(
          await golden({ timeDimension: { granularity } }),
        ).toMatchSnapshot();
      },
    );

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

    it("build bucket=entity field=name metrics=count", async () => {
      expect(
        await golden({ entityDimension: { field: "name" } }),
      ).toMatchSnapshot();
    });

    it("build bucket=entity field=name metrics=none", async () => {
      expect(
        await golden({ entityDimension: { field: "name" }, metrics: [] }),
      ).toMatchSnapshot();
    });

    // countScores forces two-level even with the single-level flag on.
    it("build bucket=entity field=name measure=countScores", async () => {
      expect(
        await golden(
          {
            entityDimension: { field: "name" },
            metrics: [{ measure: "countScores", aggregation: "sum" }],
          },
          true,
        ),
      ).toMatchSnapshot();
    });
  });

  describe("levels", () => {
    it("build level=two-forced measure=countScores", async () => {
      expect(
        await golden(
          { metrics: [{ measure: "countScores", aggregation: "sum" }] },
          true,
        ),
      ).toMatchSnapshot();
    });

    it("build level=two bucket=time", async () => {
      expect(
        await golden({ timeDimension: { granularity: "day" } }, false),
      ).toMatchSnapshot();
    });

    // ORDER BY without WITH FILL after the outer GROUP BY.
    it("build level=two bucket=time orderBy=given", async () => {
      expect(
        await golden(
          {
            timeDimension: { granularity: "day" },
            orderBy: [{ field: "count_count", direction: "desc" }],
          },
          false,
        ),
      ).toMatchSnapshot();
    });

    // WITH FILL then LIMIT, both after the outer GROUP BY.
    it("build level=two bucket=time row_limit via chartConfig", async () => {
      expect(
        await golden(
          {
            timeDimension: { granularity: "day" },
            chartConfig: { type: "LINE_TIME_SERIES", row_limit: 50 },
          },
          false,
        ),
      ).toMatchSnapshot();
    });

    it("build level=two metrics=none", async () => {
      expect(
        await golden({ dimensions: [{ field: "name" }], metrics: [] }, false),
      ).toMatchSnapshot();
    });
  });

  describe("dimensions", () => {
    // Inlines a string constant and reads a metadata subscript.
    it("build level=single dim=aiGatewayKeyOwnerUserId", async () => {
      expect(
        await golden({ dimensions: [{ field: "aiGatewayKeyOwnerUserId" }] }),
      ).toMatchSnapshot();
    });

    it.each([
      ["single", true],
      ["two", false],
    ] as const)(
      "build level=%s dims=name,environment metrics=count,latency",
      async (_level, singleLevel) => {
        expect(
          await golden(
            {
              dimensions: [{ field: "name" }, { field: "environment" }],
              metrics: [
                { measure: "count", aggregation: "count" },
                { measure: "latency", aggregation: "avg" },
              ],
            },
            singleLevel,
          ),
        ).toMatchSnapshot();
      },
    );

    it("build dims=costType,usageType throws", async () => {
      await expect(
        golden({
          dimensions: [{ field: "costType" }, { field: "usageType" }],
        }),
      ).rejects.toThrowErrorMatchingSnapshot();
    });
  });

  describe("measures", () => {
    it.each(SINGLE_LEVEL_MEASURES)(
      "build level=single measure=%s agg=%s",
      async (measure, aggregation) => {
        expect(
          await golden({ metrics: [{ measure, aggregation }] }, true),
        ).toMatchSnapshot();
      },
    );

    it.each(TWO_LEVEL_MEASURES)(
      "build level=two measure=%s agg=%s",
      async (measure, aggregation) => {
        expect(
          await golden({ metrics: [{ measure, aggregation }] }, false),
        ).toMatchSnapshot();
      },
    );

    // No FINAL and no `is_deleted = 0` on the scores join, so `uniq(scores.id)`
    // counts scores whose latest version is deleted (legacy, pinned).
    it("build measure=countScores skipScoresFinal=true", async () => {
      vi.mocked(shouldSkipScoresDedup).mockReturnValueOnce(true);
      expect(
        await golden({
          metrics: [{ measure: "countScores", aggregation: "sum" }],
        }),
      ).toMatchSnapshot();
    });

    it("build metrics=none", async () => {
      expect(await golden({ metrics: [] })).toMatchSnapshot();
    });

    // Includes the `quantile(q)(...)` template; totalCost reads bare
    // `total_cost` (legacy, pinned).
    it("build metrics=count,totalCost,latency", async () => {
      expect(
        await golden({
          metrics: [
            { measure: "count", aggregation: "count" },
            { measure: "totalCost", aggregation: "sum" },
            { measure: "latency", aggregation: "p95" },
          ],
        }),
      ).toMatchSnapshot();
    });
  });

  describe("aggregations", () => {
    it("build agg=histogram chartConfig.bins=25", async () => {
      expect(
        await golden({
          metrics: [{ measure: "latency", aggregation: "histogram" }],
          chartConfig: { type: "HISTOGRAM", bins: 25 },
        }),
      ).toMatchSnapshot();
    });
  });

  describe("filters", () => {
    it.each(FILTERS)("build filter=%s", async (_name, filter) => {
      expect(await golden({ filters: [filter] })).toMatchSnapshot();
    });

    it("build filters=type=,name-contains", async () => {
      expect(
        await golden({
          filters: [
            {
              column: "type",
              type: "string",
              operator: "=",
              value: "GENERATION",
            },
            {
              column: "name",
              type: "string",
              operator: "contains",
              value: "chat",
            },
          ],
        }),
      ).toMatchSnapshot();
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
        true,
      );
      expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
    });

    // The field matches the dimension's SQL, not its alias.
    it("build orderBy=dimension via dim.sql", async () => {
      expect(
        await golden({
          dimensions: [{ field: "name" }],
          orderBy: [{ field: "events_observations.name", direction: "asc" }],
        }),
      ).toMatchSnapshot();
    });

    it("build defaultOrder dims-only metrics=none", async () => {
      expect(
        await golden({ dimensions: [{ field: "name" }], metrics: [] }),
      ).toMatchSnapshot();
    });
  });

  describe("crosses", () => {
    it("build bucket=time dim=explodeArray", async () => {
      expect(
        await golden({
          timeDimension: { granularity: "day" },
          dimensions: [{ field: "toolNames" }],
        }),
      ).toMatchSnapshot();
    });

    // The time bucket reads the rewritten table name `events_full.` under the
    // `events_observations` alias (legacy, pinned).
    it("build bucket=time filter=metadata-full", async () => {
      expect(
        await golden({
          timeDimension: { granularity: "day" },
          filters: [
            {
              column: "metadata",
              type: "stringObject",
              key: "region",
              operator: "contains",
              value: "eu",
            },
          ],
        }),
      ).toMatchSnapshot();
    });

    // The inner subquery selects and groups by the table name
    // `events_full.project_id` under the `events_observations` alias
    // (legacy, pinned).
    it("build level=two bucket=time filter=metadata-full", async () => {
      expect(
        await golden(
          {
            timeDimension: { granularity: "day" },
            filters: [
              {
                column: "metadata",
                type: "stringObject",
                key: "region",
                operator: "contains",
                value: "eu",
              },
            ],
          },
          false,
        ),
      ).toMatchSnapshot();
    });

    // ARRAY JOIN after the scores JOIN, before WHERE.
    it("build measures=countScores,costByType", async () => {
      expect(
        await golden({
          metrics: [
            { measure: "countScores", aggregation: "sum" },
            { measure: "costByType", aggregation: "sum" },
          ],
        }),
      ).toMatchSnapshot();
    });
  });
});
