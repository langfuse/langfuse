import pLimit from "p-limit";
import { v4 } from "uuid";
import { beforeAll, describe, expect, it } from "vitest";

import { executeQuery } from "@langfuse/shared/query/server";
import {
  getViewDeclaration,
  viewsV2,
  type QueryType,
} from "@langfuse/shared/query";
import { getValidMonitorAggregationsForMeasure } from "@langfuse/shared/monitors";
import { queryClickhouse } from "@langfuse/shared/src/server";

/** eventsCoreAvailable reports whether the dev-only `events_core` table exists. */
async function eventsCoreAvailable(): Promise<boolean> {
  // events_core is created by ch:dev-tables, not migrations; absent in -azure/-redis-cluster CI legs.
  const rows = await queryClickhouse<Record<string, unknown>>({
    query: "EXISTS TABLE events_core",
    params: {},
  });
  return Number(Object.values(rows[0] ?? {})[0]) === 1;
}

/** parseNumericValue coerces a ClickHouse cell to number | null, mirroring the monitor processor. */
function parseNumericValue(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** combos enumerates every (view, measure, aggregation) a monitor can run. */
const combos = viewsV2.options.flatMap((view) => {
  const declaration = getViewDeclaration(view, "v2");
  return Object.entries(declaration.measures).flatMap(([measure, def]) =>
    getValidMonitorAggregationsForMeasure(def).map((aggregation) => ({
      view,
      measure,
      aggregation,
    })),
  );
});

/** scalarValue runs one monitor scalar query against an empty project and returns its number | null. */
async function scalarValue(query: QueryType): Promise<number | null> {
  const rows = await executeQuery(v4(), query, "v2", true);
  const row = (rows[0] ?? {}) as Record<string, unknown>;
  return parseNumericValue(Object.values(row)[0]);
}

describe("monitor scalar query — empty project", () => {
  let hasEventsCore = false;
  beforeAll(async () => {
    hasEventsCore = await eventsCoreAvailable();
  });

  it("verifies which parameters return zero and which return null", async (ctx) => {
    if (!hasEventsCore) ctx.skip();
    // One roundtrip per combo; bounded concurrency keeps the test well inside
    // its timeout on remote ClickHouse deployments with higher latency.
    const limit = pLimit(8);
    const entries = await Promise.all(
      combos.map(({ view, measure, aggregation }) =>
        limit(async () => {
          const value = await scalarValue({
            view,
            dimensions: [],
            metrics: [{ measure, aggregation }],
            filters: [],
            timeDimension: null,
            fromTimestamp: "2025-01-01T00:00:00.000Z",
            toTimestamp: "2025-03-01T00:00:00.000Z",
            orderBy: null,
          });
          return [`${view}/${measure}/${aggregation}`, value] as const;
        }),
      ),
    );
    expect(Object.fromEntries(entries)).toMatchSnapshot();
  }, 30_000);
});
