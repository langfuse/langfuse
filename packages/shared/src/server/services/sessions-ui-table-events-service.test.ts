import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FilterState } from "../../types";

const mockQueryClickhouse = vi.hoisted(() => vi.fn());

vi.mock("../repositories", () => ({
  OBSERVATIONS_TO_TRACE_INTERVAL: "INTERVAL 2 DAY",
  SCORE_TO_TRACE_OBSERVATIONS_INTERVAL: "INTERVAL 1 HOUR",
  clickhouseCompliantRandomCharacters: () => "test",
  queryClickhouse: mockQueryClickhouse,
}));

vi.mock("../clickhouse/client", () => ({
  convertDateToClickhouseDateTime: (date: Date) => date.toISOString(),
}));

vi.mock("../repositories/clickhouse", () => ({
  parseClickhouseUTCDateTimeFormat: (date: string) => new Date(date),
}));

vi.mock("../logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

import { getSessionsTableFromEvents } from "./sessions-ui-table-events-service";

describe("session tool filters from events", () => {
  beforeEach(() => {
    mockQueryClickhouse.mockReset().mockResolvedValue([]);
  });

  it("deduplicates tool rows before aggregating and filters deleted observations afterward", async () => {
    const filter: FilterState = [
      {
        column: "toolNames",
        type: "arrayOptions",
        operator: "any of",
        value: ["old-tool"],
      },
    ];

    await getSessionsTableFromEvents({ projectId: "project-1", filter });

    const { query } = mockQueryClickhouse.mock.calls[0]![0] as {
      query: string;
    };
    expect(query).toMatch(
      /session_tools AS \(SELECT[\s\S]*FROM \(SELECT[\s\S]*FROM events_core e[\s\S]*ORDER BY e\.event_ts DESC[\s\S]*LIMIT 1 BY e\.project_id, e\.span_id\)[\s\S]*WHERE is_deleted = 0[\s\S]*GROUP BY session_id\)/,
    );
    expect(query).toContain(
      "LEFT JOIN session_tools st ON st.tool_session_id = s.session_id",
    );
    expect(query).toContain(
      "e.session_id IN (SELECT session_id FROM session_data)",
    );
    expect(query).toContain(
      "groupUniqArrayArray(mapKeys(tool_definitions)) AS tool_names",
    );
    expect(query).toContain("hasAny(");
    expect(query).toContain("st.tool_names");
    expect(query).not.toContain("s.tool_names");
  });

  it.each([
    [
      "calledToolNames",
      "arrayOptions",
      "any of",
      ["called-tool"],
      "st.called_tool_names",
    ],
    ["toolCalls", "number", ">=", 1, "st.tool_calls_count"],
  ] as const)(
    "filters %s using joined tool data",
    async (column, type, operator, value, internal) => {
      await getSessionsTableFromEvents({
        projectId: "project-1",
        filter: [{ column, type, operator, value }] as FilterState,
      });

      const { query } = mockQueryClickhouse.mock.calls[0]![0] as {
        query: string;
      };
      expect(query).toContain(internal);
      expect(query).not.toContain(`s.${internal.split(".")[1]}`);
    },
  );

  it("does not add a tool scan for sessions without tool filters", async () => {
    await getSessionsTableFromEvents({ projectId: "project-1", filter: [] });

    const { query } = mockQueryClickhouse.mock.calls[0]![0] as {
      query: string;
    };
    expect(query).not.toContain("session_tools AS (");
  });

  it("joins tool data when ordering by tool calls without a tool filter", async () => {
    await getSessionsTableFromEvents({
      projectId: "project-1",
      filter: [],
      orderBy: { column: "toolCalls", order: "DESC" },
    });

    const { query } = mockQueryClickhouse.mock.calls[0]![0] as {
      query: string;
    };
    expect(query).toContain("session_tools AS (");
    expect(query).toContain(
      "LEFT JOIN session_tools st ON st.tool_session_id = s.session_id",
    );
    expect(query).toContain("st.tool_calls_count");
  });
});
