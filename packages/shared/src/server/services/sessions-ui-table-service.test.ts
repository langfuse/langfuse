import { describe, expect, it, vi } from "vitest";

const mockQueryClickhouse = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock("../repositories", () => ({
  TRACE_TO_OBSERVATIONS_INTERVAL: "INTERVAL 1 HOUR",
  clickhouseCompliantRandomCharacters: () => "test",
  queryClickhouse: mockQueryClickhouse,
}));

vi.mock("../clickhouse/client", () => ({
  convertDateToClickhouseDateTime: (date: Date) => date.toISOString(),
}));

vi.mock("../logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

import { getSessionsTable } from "./sessions-ui-table-service";

describe("session tool ordering from traces", () => {
  it("aggregates tools when ordering without a tool filter", async () => {
    await getSessionsTable({
      projectId: "project-1",
      filter: [],
      orderBy: { column: "toolCalls", order: "DESC" },
    });

    const { query } = mockQueryClickhouse.mock.calls[0]![0] as {
      query: string;
    };
    expect(query).toContain("sum(length(o.tool_calls)) as tool_calls_count");
    expect(query).toContain("LEFT JOIN observations_agg o");
    expect(query).toContain("ORDER BY tool_calls_count DESC");
  });
});
