import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  capturedQueries,
  clickhouseFormatAvailable,
  normalizeCapturedQueries,
  resetCaptures,
} from "../../../server/repositories/goldenHarness";

vi.mock("../../../server/repositories/clickhouse", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../server/repositories/clickhouse")
    >();
  const { buildClickhouseMock } =
    await import("../../../server/repositories/goldenHarness.js");
  return buildClickhouseMock(actual);
});

// The OTEL FINAL check reads Redis; pin it so the SQL is deterministic.
vi.mock("../../../server/queries/clickhouse-sql/query-options", () => ({
  shouldSkipObservationsFinal: vi.fn().mockResolvedValue(false),
  shouldSkipScoresDedup: vi.fn().mockReturnValue(false),
}));

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
