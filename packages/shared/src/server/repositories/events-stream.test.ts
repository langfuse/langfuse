import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FilterCondition } from "../../types";

const rows = ["span-c", "span-b", "span-a"].map((id) => ({
  id,
  trace_id: "trace-1",
  parent_observation_id: null,
  trace_name: null,
  cursor_start_time: "2026-01-01 00:00:00.000000",
}));
const queries = vi.hoisted((): string[] => []);

vi.mock("./clickhouse", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./clickhouse")>()),
  queryClickhouse: async ({ query }: { query: string }) => {
    queries.push(query);
    return rows.map(({ id }) => ({ id }));
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
      yield* rows.filter((row) => params.spanIds!.includes(row.id));
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
});
