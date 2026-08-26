import { beforeEach, describe, expect, it, vi } from "vitest";

const queryClickhouse = vi.hoisted(() => vi.fn());

vi.mock("./clickhouse", () => ({
  queryClickhouse,
  commandClickhouse: vi.fn(),
  queryClickhouseStream: vi.fn(),
  queryClickhouseStreamRawText: vi.fn(),
  queryClickhouseExecRaw: vi.fn(),
  parseClickhouseUTCDateTimeFormat: vi.fn(),
  clickhouseCompliantRandomCharacters: vi.fn(() => "filterSuffix"),
  BLOB_EXPORT_PARQUET_CLICKHOUSE_SETTINGS: {},
}));

import { getTracesCountFromEventsTableForPublicApi } from "./events";

describe("events-backed public trace filters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClickhouse.mockResolvedValue([{ count: "0" }]);
  });

  it.each([
    ["evaluatorId", "t.evaluator_id"],
    ["ruleId", "t.evaluation_rule_id"],
  ] as const)(
    "filters %s through its dedicated column",
    async (column, sql) => {
      await getTracesCountFromEventsTableForPublicApi({
        projectId: "project-1",
        page: 1,
        limit: 10,
        advancedFilters: [
          {
            type: "stringOptions",
            column,
            operator: "any of",
            value: ["id-1"],
          },
        ],
      });

      const { query } = queryClickhouse.mock.calls[0][0];
      expect(query).toContain(sql);
      expect(query).not.toContain("t.metadata[");
    },
  );
});
