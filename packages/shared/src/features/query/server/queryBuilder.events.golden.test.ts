import { describe, expect, it, vi } from "vitest";

import {
  clickhouseFormatAvailable,
  normalizeCapturedQueries,
} from "../../../server/repositories/goldenHarness";
import { query } from "../types";
import { QueryBuilder } from "./queryBuilder";

// QueryBuilder.build checks the OTEL FINAL optimization before filter lowering.
// Mock it so this stays unit-level and does not need ClickHouse.
vi.mock("../../../server/queries/clickhouse-sql/query-options", () => ({
  shouldSkipObservationsFinal: vi.fn().mockResolvedValue(false),
}));

const describeWithClickhouse = clickhouseFormatAvailable()
  ? describe
  : describe.skip;

describeWithClickhouse("golden: dashboard events views", () => {
  it.each(["traces", "observations"] as const)(
    "QueryBuilder v2 view=%s count by hour",
    async (view) => {
      const { query: sql, parameters } = await new QueryBuilder(
        undefined,
        "v2",
      ).build(
        query.parse({
          view,
          dimensions: [],
          metrics: [{ measure: "count", aggregation: "count" }],
          filters: [],
          timeDimension: { granularity: "hour" },
          fromTimestamp: "2026-01-01T00:00:00.000Z",
          toTimestamp: "2026-01-02T00:00:00.000Z",
          orderBy: null,
        }),
        "golden-project",
      );
      expect(
        normalizeCapturedQueries([
          { fn: "QueryBuilder.build", query: sql, params: parameters },
        ]),
      ).toMatchSnapshot();
    },
  );

  it.each(["traceName", "observationName"] as const)(
    "QueryBuilder v2 view=scores-numeric dimension=%s",
    async (dimension) => {
      const { query: sql, parameters } = await new QueryBuilder(
        undefined,
        "v2",
      ).build(
        query.parse({
          view: "scores-numeric",
          dimensions: [{ field: dimension }],
          metrics: [{ measure: "count", aggregation: "count" }],
          filters: [],
          timeDimension: null,
          fromTimestamp: "2026-01-01T00:00:00.000Z",
          toTimestamp: "2026-01-02T00:00:00.000Z",
          orderBy: null,
        }),
        "golden-project",
      );
      expect(
        normalizeCapturedQueries([
          { fn: "QueryBuilder.build", query: sql, params: parameters },
        ]),
      ).toMatchSnapshot();
    },
  );
});
