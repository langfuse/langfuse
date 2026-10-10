import { describe, it, expect, beforeEach, vi } from "vitest";

const mockQueryClickhouse = vi.hoisted(() => vi.fn());

vi.mock("./clickhouse", () => ({
  queryClickhouse: mockQueryClickhouse,
  commandClickhouse: vi.fn(),
  queryClickhouseStream: vi.fn(),
  queryClickhouseExecRaw: vi.fn(),
  upsertClickhouse: vi.fn(),
  parseClickhouseUTCDateTimeFormat: vi.fn(),
  clickhouseCompliantRandomCharacters: vi.fn(() => "x"),
  BLOB_EXPORT_PARQUET_CLICKHOUSE_SETTINGS: {},
}));

import {
  getScoresForTraces,
  getScoresForSessions,
  getScoresForExperiments,
} from "../index";

const PAGINATION_CLAUSE = "limit {limit: Int32} offset {offset: Int32}";

const lastQuery = () => {
  expect(mockQueryClickhouse).toHaveBeenCalledOnce();
  return mockQueryClickhouse.mock.calls[0][0] as {
    query: string;
    params: Record<string, unknown>;
  };
};

const callers = [
  {
    name: "getScoresForTraces",
    call: (pagination: { limit?: number; offset?: number }) =>
      getScoresForTraces({
        projectId: "project-1",
        traceIds: ["trace-1"],
        ...pagination,
      }),
  },
  {
    name: "getScoresForSessions",
    call: (pagination: { limit?: number; offset?: number }) =>
      getScoresForSessions({
        projectId: "project-1",
        sessionIds: ["session-1"],
        ...pagination,
      }),
  },
  {
    name: "getScoresForExperiments",
    call: (pagination: { limit?: number; offset?: number }) =>
      getScoresForExperiments({
        projectId: "project-1",
        runIds: ["run-1"],
        ...pagination,
      }),
  },
];

describe("score repository pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryClickhouse.mockResolvedValue([]);
  });

  describe.each(callers)("$name", ({ call }) => {
    it("applies the requested page size on the first page (offset 0)", async () => {
      await call({ limit: 50, offset: 0 });

      const { query, params } = lastQuery();
      expect(query).toContain(PAGINATION_CLAUSE);
      expect(params).toMatchObject({ limit: 50, offset: 0 });
    });

    it("applies pagination for a positive offset", async () => {
      await call({ limit: 50, offset: 50 });

      const { query, params } = lastQuery();
      expect(query).toContain(PAGINATION_CLAUSE);
      expect(params).toMatchObject({ limit: 50, offset: 50 });
    });

    it("omits pagination when limit and offset are not provided", async () => {
      await call({});

      expect(lastQuery().query).not.toContain(PAGINATION_CLAUSE);
    });
  });
});
