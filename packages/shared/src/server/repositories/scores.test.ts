import { describe, it, expect, beforeEach, vi } from "vitest";

const mockQueryClickhouse = vi.hoisted(() => vi.fn());
const mockShouldSkipScoresDedup = vi.hoisted(() =>
  vi.fn<(projectId: string) => boolean>(() => false),
);

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
  shouldSkipScoresDedup: mockShouldSkipScoresDedup,
}));

import {
  getScoresForTraces,
  getScoresForSessions,
  getScoresForExperiments,
  listScoresV3ForPublicApi,
  _handleGenerateScoresForPublicApi,
  FilterList,
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

describe("public score lists without dedup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryClickhouse.mockResolvedValue([]);
  });

  const listV3 = async (skipDedup: boolean) => {
    mockQueryClickhouse.mockClear();
    mockShouldSkipScoresDedup.mockReturnValue(skipDedup);
    await listScoresV3ForPublicApi({
      projectId: "proj-1",
      limit: 50,
      fields: ["core"],
    });
    return mockQueryClickhouse.mock.calls[0][0].query as string;
  };

  const listV1V2 = async (skipDedup: boolean, needsTraceJoin: boolean) => {
    mockQueryClickhouse.mockClear();
    mockShouldSkipScoresDedup.mockReturnValue(skipDedup);
    await _handleGenerateScoresForPublicApi({
      projectId: "proj-1",
      scoresFilter: new FilterList([]),
      tracesFilter: new FilterList([]),
      scoreScope: "all",
      includeTrace: false,
      needsTraceJoin,
      pagination: { limit: 50, page: 1 },
    });
    return mockQueryClickhouse.mock.calls[0][0].query as string;
  };

  it("v3 list orders by the sort-key day first", async () => {
    expect(await listV3(true)).toContain(
      "ORDER BY toDate(s.timestamp) DESC, s.timestamp DESC, s.id DESC",
    );
    expect(await listV3(false)).not.toContain("toDate(s.timestamp) DESC");
  });

  it("v1/v2 list orders by the sort-key day first", async () => {
    expect(await listV1V2(true, false)).toMatch(
      /ORDER BY\s+toDate\(s\.timestamp\) desc, s\.timestamp desc/,
    );
    expect(await listV1V2(true, true)).not.toContain(
      "toDate(s.timestamp) desc",
    );
    expect(await listV1V2(false, false)).not.toContain(
      "toDate(s.timestamp) desc",
    );
  });
});
