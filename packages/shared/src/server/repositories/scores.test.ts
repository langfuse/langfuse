import { describe, it, expect, beforeEach, vi } from "vitest";

const mockQueryClickhouse = vi.hoisted(() => vi.fn());

vi.mock("./clickhouse", () => ({
  queryClickhouse: mockQueryClickhouse,
  queryClickhouseStream: vi.fn(),
  queryClickhouseExecRaw: vi.fn(),
  commandClickhouse: vi.fn(),
  upsertClickhouse: vi.fn(),
  parseClickhouseUTCDateTimeFormat: vi.fn(),
  clickhouseCompliantRandomCharacters: vi.fn(() => "x"),
  BLOB_EXPORT_PARQUET_CLICKHOUSE_SETTINGS: {},
}));

// Break the query-options -> server-barrel import cycle that otherwise fails
// module initialization when the graph is entered from this repository file.
vi.mock("../queries/clickhouse-sql/query-options", () => ({
  shouldSkipObservationsFinal: vi.fn().mockResolvedValue(false),
}));

import {
  getScoresForTraces,
  getScoresForSessions,
  getScoresForExperiments,
} from "../index";

const PAGINATION_CLAUSE = "limit {limit: Int32} offset {offset: Int32}";

describe("score repository pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryClickhouse.mockResolvedValue([]);
  });

  const cases = [
    {
      name: "getScoresForTraces",
      run: () =>
        getScoresForTraces({
          projectId: "proj-1",
          traceIds: ["t-1"],
          limit: 50,
          offset: 0,
        }),
    },
    {
      name: "getScoresForSessions",
      run: () =>
        getScoresForSessions({
          projectId: "proj-1",
          sessionIds: ["s-1"],
          limit: 50,
          offset: 0,
        }),
    },
    {
      name: "getScoresForExperiments",
      run: () =>
        getScoresForExperiments({
          projectId: "proj-1",
          runIds: ["r-1"],
          limit: 50,
          offset: 0,
        }),
    },
  ];

  it.each(cases)(
    "$name applies LIMIT/OFFSET when offset is 0",
    async ({ run }) => {
      await run();

      const { query } = mockQueryClickhouse.mock.calls[0][0];
      expect(query).toContain(PAGINATION_CLAUSE);
    },
  );

  it("omits LIMIT/OFFSET when limit and offset are undefined", async () => {
    await getScoresForTraces({ projectId: "proj-1", traceIds: ["t-1"] });

    const { query } = mockQueryClickhouse.mock.calls[0][0];
    expect(query).not.toContain(PAGINATION_CLAUSE);
  });
});
