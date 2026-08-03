import { beforeEach, describe, expect, it, vi } from "vitest";

const mockQueryClickhouse = vi.hoisted(() => vi.fn());
const mockShouldSkipObservationsFinal = vi.hoisted(() => vi.fn());
const mockClickhouseCompliantRandomCharacters = vi.hoisted(() => vi.fn());

vi.mock("../repositories", () => ({
  OBSERVATIONS_TO_TRACE_INTERVAL: "INTERVAL 2 DAY",
  SCORE_TO_TRACE_OBSERVATIONS_INTERVAL: "INTERVAL 1 HOUR",
  clickhouseCompliantRandomCharacters: mockClickhouseCompliantRandomCharacters,
  parseClickhouseUTCDateTimeFormat: (date: string) => new Date(date),
  queryClickhouse: mockQueryClickhouse,
  reduceUsageOrCostDetails: (details: Record<string, number>) => details,
}));

vi.mock("../queries/clickhouse-sql/query-options", () => ({
  shouldSkipObservationsFinal: mockShouldSkipObservationsFinal,
}));

import {
  getTraceDeleteCursorPageFromTraces,
  getTracesTable,
  getTracesTableMetrics,
} from "./traces-ui-table-service";
import type { FilterState } from "../../types";

const scoreFilter: FilterState = [
  {
    column: "scores_avg",
    type: "numberObject",
    key: "quality",
    operator: ">",
    value: 0.5,
  },
];

const getCapturedQuery = () => {
  const { query, params } = mockQueryClickhouse.mock.calls.at(-1)![0] as {
    query: string;
    params: Record<string, unknown>;
  };

  return {
    query: query.replace(/\s+/g, " "),
    params,
  };
};

describe("getTraceDeleteCursorPageFromTraces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let counter = 0;
    mockClickhouseCompliantRandomCharacters.mockImplementation(
      () => `x${++counter}`,
    );
    mockQueryClickhouse.mockResolvedValue([]);
    mockShouldSkipObservationsFinal.mockResolvedValue(false);
  });

  it("uses canonical cursor ordering without FINAL", async () => {
    await getTraceDeleteCursorPageFromTraces({
      projectId: "project-1",
      filter: [],
      cutoffCreatedAt: new Date("2026-01-01T00:00:00.000Z"),
      limit: 100,
    });

    expect(mockQueryClickhouse).toHaveBeenCalledOnce();
    const { query } = mockQueryClickhouse.mock.calls[0]![0] as {
      query: string;
    };
    const normalizedQuery = query.replace(/\s+/g, " ");

    expect(normalizedQuery).toMatch(/\bFROM traces t\b/);
    expect(normalizedQuery).not.toMatch(/\bFROM traces t FINAL\b/);
    expect(normalizedQuery).toContain(
      "ORDER BY t.timestamp DESC, t.id DESC, t.event_ts DESC",
    );
    expect(normalizedQuery).toContain("LIMIT 1 BY id, project_id");
    expect(normalizedQuery).toContain("LIMIT {limit: Int32}");
  });

  it("pushes referenced score names into filter-only score aggregation", async () => {
    await getTracesTable({
      projectId: "project-1",
      filter: scoreFilter,
      limit: 50,
      page: 0,
    });

    const { query, params } = getCapturedQuery();
    expect(query).toContain("name IN ({");
    expect(Object.values(params)).toContainEqual(["quality"]);
  });

  it("keeps complete score aggregation for metrics", async () => {
    await getTracesTableMetrics({
      projectId: "project-1",
      filter: scoreFilter,
      limit: 50,
      page: 0,
    });

    expect(getCapturedQuery().query).not.toContain("name IN ({");
  });

  it("keeps complete score aggregation when ordering by scores", async () => {
    await getTracesTable({
      projectId: "project-1",
      filter: scoreFilter,
      orderBy: { column: "scores_avg", order: "ASC" },
      limit: 50,
      page: 0,
    });

    expect(getCapturedQuery().query).not.toContain("name IN ({");
  });
});
