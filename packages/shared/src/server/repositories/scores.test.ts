import { describe, it, expect, beforeEach, vi } from "vitest";

const mockQueryClickhouse = vi.hoisted(() => vi.fn());

vi.mock("./clickhouse", () => ({
  queryClickhouse: mockQueryClickhouse,
  commandClickhouse: vi.fn(),
  queryClickhouseStream: vi.fn(),
  queryClickhouseExecRaw: vi.fn(),
  upsertClickhouse: vi.fn(),
  parseClickhouseUTCDateTimeFormat: vi.fn(),
  clickhouseCompliantRandomCharacters: vi.fn(() => "x1"),
}));

vi.mock("../queries/clickhouse-sql/query-options", () => ({
  shouldSkipObservationsFinal: vi.fn().mockResolvedValue(false),
}));

// Avoid pulling in the full server barrel (../../db -> ./server -> ...)
// which is unrelated to these pagination-only query builders.
vi.mock("../../db", () => ({ prisma: {} }));

// clickhouse-filter.ts pulls in the repositories barrel (./index) just for
// clickhouseCompliantRandomCharacters, which drags in events.ts and a
// pre-existing circular-import ordering issue unrelated to pagination.
vi.mock("./index", () => ({
  clickhouseCompliantRandomCharacters: vi.fn(() => "x1"),
}));

import {
  getScoresForSessions,
  getScoresForExperiments,
  getScoresForTraces,
} from "./scores";

describe("score repository pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryClickhouse.mockResolvedValue([]);
  });

  it("applies LIMIT/OFFSET for getScoresForSessions when offset is 0", async () => {
    await getScoresForSessions({
      projectId: "proj-1",
      sessionIds: ["s1"],
      limit: 10,
      offset: 0,
    });

    const { query } = mockQueryClickhouse.mock.calls[0][0];
    expect(query).toContain("limit {limit: Int32} offset {offset: Int32}");
  });

  it("applies LIMIT/OFFSET for getScoresForExperiments when offset is 0", async () => {
    await getScoresForExperiments({
      projectId: "proj-1",
      runIds: ["r1"],
      limit: 10,
      offset: 0,
    });

    const { query } = mockQueryClickhouse.mock.calls[0][0];
    expect(query).toContain("limit {limit: Int32} offset {offset: Int32}");
  });

  it("applies LIMIT/OFFSET for getScoresForTraces when offset is 0", async () => {
    await getScoresForTraces({
      projectId: "proj-1",
      traceIds: ["t1"],
      limit: 10,
      offset: 0,
    });

    const { query } = mockQueryClickhouse.mock.calls[0][0];
    expect(query).toContain("limit {limit: Int32} offset {offset: Int32}");
  });
});
