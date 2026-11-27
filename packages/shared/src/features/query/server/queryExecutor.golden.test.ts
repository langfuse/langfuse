// Golden SQL of v2 executeQuery filters and group-bys per view and dimension.

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  capturedQueries,
  clickhouseFormatAvailable,
  normalizeCapturedQueries,
  resetCaptures,
} from "../../../server/repositories/__tests__/goldenHarness";

vi.mock("../../../server/repositories/clickhouse", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../server/repositories/clickhouse")
    >();
  const { buildClickhouseMock } =
    await import("../../../server/repositories/__tests__/goldenHarness.js");
  return buildClickhouseMock(actual);
});

// The OTEL FINAL check reads Redis; pin it so the SQL is deterministic.
vi.mock("../../../server/queries/clickhouse-sql/query-options", () => ({
  shouldSkipObservationsFinal: vi.fn().mockResolvedValue(false),
  shouldSkipScoresDedup: vi.fn().mockReturnValue(false),
}));

import { env } from "../../../env";
import { type QueryType } from "../types";
import { executeQuery } from "./queryExecutor";

const FIXED_PROJECT_ID = "golden-project";

const describeWithClickhouse = clickhouseFormatAvailable()
  ? describe
  : describe.skip;

if (!clickhouseFormatAvailable()) {
  console.warn(
    "[golden-harness] `clickhouse format` unavailable — skipping golden SQL tests. Install clickhouse-local to run them.",
  );
}

type Filter = QueryType["filters"][number];

// Score-level columns read the scores table only; trace and observation
// columns pull in the events join. The traces view names the same trace
// columns differently and has no observation column.
const dimensions: Array<{
  label: string;
  scoreField: string;
  traceField?: string;
  filter: (column: string) => Filter;
}> = [
  {
    label: "name",
    scoreField: "name",
    filter: (column) => stringEq(column, "golden-score"),
  },
  {
    label: "traceId",
    scoreField: "traceId",
    traceField: "id",
    filter: (column) => stringEq(column, "golden-trace-id"),
  },
  {
    label: "tags",
    scoreField: "tags",
    traceField: "tags",
    filter: (column) => ({
      column,
      operator: "any of",
      value: ["golden-tag"],
      type: "arrayOptions",
    }),
  },
  {
    label: "traceName",
    scoreField: "traceName",
    traceField: "name",
    filter: (column) => stringEq(column, "golden-trace-name"),
  },
  {
    label: "userId",
    scoreField: "userId",
    traceField: "userId",
    filter: (column) => stringEq(column, "golden-user"),
  },
  {
    label: "sessionId",
    scoreField: "sessionId",
    traceField: "sessionId",
    filter: (column) => stringEq(column, "golden-session"),
  },
  {
    label: "observationName",
    scoreField: "observationName",
    filter: (column) => stringEq(column, "golden-observation-name"),
  },
];

function stringEq(column: string, value: string): Filter {
  return { column, operator: "=", value, type: "string" };
}

function buildQuery(
  view: QueryType["view"],
  shape: { groupBy?: string; filter?: Filter },
): QueryType {
  return {
    view,
    dimensions: shape.groupBy ? [{ field: shape.groupBy }] : [],
    metrics: [{ measure: "count", aggregation: "count" }],
    filters: shape.filter ? [shape.filter] : [],
    timeDimension: null,
    fromTimestamp: "2026-01-01T00:00:00.000Z",
    toTimestamp: "2026-01-02T00:00:00.000Z",
    orderBy: null,
  } as QueryType;
}

const views = [
  { view: "scores-numeric" as const, field: "scoreField" as const },
  { view: "scores-categorical" as const, field: "scoreField" as const },
  { view: "traces" as const, field: "traceField" as const },
];

describeWithClickhouse("golden: metrics v2 executeQuery", () => {
  beforeEach(() => resetCaptures());

  for (const { view, field } of views) {
    describe(view, () => {
      for (const dimension of dimensions) {
        const column = dimension[field];
        if (!column) continue;

        it(`filter ${dimension.label}`, async () => {
          await executeQuery(
            FIXED_PROJECT_ID,
            buildQuery(view, { filter: dimension.filter(column) }),
            "v2",
          );
          expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
        });

        it(`group by ${dimension.label}`, async () => {
          await executeQuery(
            FIXED_PROJECT_ID,
            buildQuery(view, { groupBy: column }),
            "v2",
          );
          expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
        });
      }
    });
  }
});

// Chart config on v1 observations and the root-event window on v2 traces,
// both assembled as SQL text.
describeWithClickhouse("golden: SQL-text executeQuery options", () => {
  const originalSingleLevel =
    env.LANGFUSE_ENABLE_SINGLE_LEVEL_QUERY_OPTIMIZATION;

  // The env flag ORs into the argument; pin it off so the argument decides.
  beforeAll(() => {
    env.LANGFUSE_ENABLE_SINGLE_LEVEL_QUERY_OPTIMIZATION = "false";
  });
  afterAll(() => {
    env.LANGFUSE_ENABLE_SINGLE_LEVEL_QUERY_OPTIMIZATION = originalSingleLevel;
  });
  beforeEach(() => resetCaptures());

  describe("histogram bins", () => {
    const histogramQuery = {
      view: "observations",
      dimensions: [],
      metrics: [{ measure: "totalCost", aggregation: "histogram" }],
      filters: [stringEq("type", "generation")],
      timeDimension: null,
      fromTimestamp: "2026-01-01T00:00:00.000Z",
      toTimestamp: "2026-01-02T00:00:00.000Z",
      orderBy: null,
      chartConfig: { type: "HISTOGRAM", bins: 20 },
    } as QueryType;

    it("two-level", async () => {
      await executeQuery(FIXED_PROJECT_ID, histogramQuery, "v1", false);
      expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
    });

    it("single-level", async () => {
      await executeQuery(FIXED_PROJECT_ID, histogramQuery, "v1", true);
      expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
    });
  });

  describe("row_limit", () => {
    const tableQuery = (config: Pick<QueryType, "chartConfig">) =>
      ({
        view: "observations",
        dimensions: [{ field: "name" }],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [],
        timeDimension: null,
        fromTimestamp: "2026-01-01T00:00:00.000Z",
        toTimestamp: "2026-01-02T00:00:00.000Z",
        orderBy: [{ field: "name", direction: "asc" }],
        ...config,
      }) as QueryType;

    it("set", async () => {
      await executeQuery(
        FIXED_PROJECT_ID,
        tableQuery({ chartConfig: { type: "TABLE", row_limit: 5 } }),
      );
      expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
    });

    it("unset", async () => {
      await executeQuery(FIXED_PROJECT_ID, tableQuery({}));
      expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
    });
  });

  describe("root-event window", () => {
    // Each QueryBuilder reads the threshold from env when it is constructed.
    const originalMaxWindowHours =
      env.LANGFUSE_ROOT_EVENT_CONDITION_MAX_WINDOW_HOURS;
    function withMaxWindowHours(hours: number) {
      env.LANGFUSE_ROOT_EVENT_CONDITION_MAX_WINDOW_HOURS = hours;
    }

    afterEach(() => {
      env.LANGFUSE_ROOT_EVENT_CONDITION_MAX_WINDOW_HOURS =
        originalMaxWindowHours;
    });

    // A 72-hour window.
    const tracesQuery = {
      view: "traces",
      dimensions: [{ field: "name" }],
      metrics: [{ measure: "count", aggregation: "count" }],
      filters: [],
      timeDimension: null,
      fromTimestamp: "2026-01-01T00:00:00.000Z",
      toTimestamp: "2026-01-04T00:00:00.000Z",
      orderBy: null,
    } as QueryType;

    it("window below the threshold", async () => {
      withMaxWindowHours(168);
      await executeQuery(
        FIXED_PROJECT_ID,
        { ...tracesQuery, timeDimension: { granularity: "day" } },
        "v2",
      );
      expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
    });

    it("window above the threshold", async () => {
      withMaxWindowHours(24);
      await executeQuery(FIXED_PROJECT_ID, tracesQuery, "v2");
      expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
    });

    it("threshold 0", async () => {
      withMaxWindowHours(0);
      await executeQuery(
        FIXED_PROJECT_ID,
        {
          ...tracesQuery,
          fromTimestamp: "2025-01-01T00:00:00.000Z",
          toTimestamp: "2026-01-01T00:00:00.000Z",
        },
        "v2",
      );
      expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
    });
  });
});
