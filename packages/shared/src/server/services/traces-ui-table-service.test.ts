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

import { getTraceDeleteCursorPageFromTraces } from "./traces-ui-table-service";

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
});
