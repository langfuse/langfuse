import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FilterCondition } from "../../types";

const toRow = (id: string) => ({
  id,
  trace_id: "trace-1",
  parent_observation_id: null,
  trace_name: null,
  start_time: "2026-01-01 00:00:00.000000",
  cursor_start_time: "2026-01-01 00:00:00.000000",
});
const rows = ["span-c", "span-b", "span-a"].map(toRow);
const queries = vi.hoisted((): string[] => []);
const boundSpanIdCounts = vi.hoisted((): number[] => []);
const resolved = vi.hoisted(() => ({ ids: [] as string[] }));

vi.mock("./clickhouse", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./clickhouse")>()),
  queryClickhouse: async ({ query }: { query: string }) => {
    queries.push(query);
    return resolved.ids.map(toRow);
  },
  queryClickhouseStream: async function* ({
    query,
    params,
  }: {
    query: string;
    params: { spanIds?: string[]; afterSpanId?: string };
  }) {
    queries.push(query);
    if (params.spanIds) {
      boundSpanIdCounts.push(params.spanIds.length);
      yield* params.spanIds.map(toRow);
      return;
    }
    const start = params.afterSpanId
      ? rows.findIndex((row) => row.id === params.afterSpanId) + 1
      : 0;
    yield* rows.slice(start, start + 1);
  },
}));

import { getEventsStreamForEval } from "./events-stream";

const scoreFilter: FilterCondition[] = [
  {
    type: "numberObject",
    column: "SCORES",
    key: "quality",
    operator: ">",
    value: 0.5,
  },
];

describe("getEventsStreamForEval", () => {
  beforeEach(() => {
    queries.length = 0;
    boundSpanIdCounts.length = 0;
    resolved.ids = rows.map((row) => row.id);
  });

  it("aggregates scores once per batch, not once per page", async () => {
    const streamed: string[] = [];
    for await (const row of await getEventsStreamForEval({
      projectId: "project-1",
      filter: scoreFilter,
      rowLimit: 10,
      pageSize: 1,
    })) {
      streamed.push((row as { span_id: string }).span_id);
    }

    expect(streamed).toEqual(["span-c", "span-b", "span-a"]);
    expect(
      queries.filter((query) => query.includes("scores_agg")),
    ).toHaveLength(1);
  });

  it("keeps each page's span id parameter within ClickHouse's field size limit", async () => {
    resolved.ids = Array.from({ length: 4_500 }, () => crypto.randomUUID());

    let streamedCount = 0;
    for await (const _row of await getEventsStreamForEval({
      projectId: "project-1",
      filter: scoreFilter,
      rowLimit: 5_000,
    })) {
      streamedCount++;
    }

    expect(streamedCount).toBe(4_500);
    expect(Math.max(...boundSpanIdCounts)).toBeLessThanOrEqual(2_000);
  });
});
