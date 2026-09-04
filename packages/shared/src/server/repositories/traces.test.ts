import { describe, it, expect, beforeEach, vi } from "vitest";

const mockQueryClickhouse = vi.hoisted(() => vi.fn());
const mockShouldSkipObservationsFinal = vi.hoisted(() => vi.fn());
let charCounter = 0;

vi.mock("./clickhouse", () => ({
  queryClickhouse: mockQueryClickhouse,
  commandClickhouse: vi.fn(),
  queryClickhouseStream: vi.fn(),
  upsertClickhouse: vi.fn(),
  parseClickhouseUTCDateTimeFormat: vi.fn(),
  // Return unique names per call so filter parameter variables don't collide
  clickhouseCompliantRandomCharacters: vi.fn(() => `x${++charCounter}`),
}));

vi.mock("../queries/clickhouse-sql/query-options", () => ({
  shouldSkipObservationsFinal: mockShouldSkipObservationsFinal,
}));

import {
  generateTracesForPublicApi,
  getTracesCountForPublicApi,
} from "./traces";
import {
  FilterList,
  NumberObjectFilter,
  StringFilter,
} from "../queries/clickhouse-sql/clickhouse-filter";

const makeScoreFilter = () =>
  new FilterList([
    new NumberObjectFilter({
      clickhouseTable: "scores",
      field: "s.scores_avg",
      key: "quality",
      operator: ">",
      value: 0.5,
    }),
  ]);

describe("public trace query construction", () => {
  beforeEach(() => {
    charCounter = 0;
    vi.clearAllMocks();
    mockQueryClickhouse.mockResolvedValue([{ count: "0" }]);
    mockShouldSkipObservationsFinal.mockResolvedValue(false);
  });

  it("uses FINAL for a non-skip-index trace filter", async () => {
    const filter = new FilterList([
      new StringFilter({
        clickhouseTable: "traces",
        field: "name",
        operator: "=",
        value: "my-trace",
      }),
    ]);

    await getTracesCountForPublicApi({ projectId: "proj-1", filter });

    expect(mockQueryClickhouse).toHaveBeenCalledOnce();
    const { query } = mockQueryClickhouse.mock.calls[0][0];
    expect(query).toMatch(/FROM\s+traces\s+t\s+FINAL/);
  });

  it("does not use FINAL for skip-index trace filters (user_id / session_id / metadata)", async () => {
    const filter = new FilterList([
      new StringFilter({
        clickhouseTable: "traces",
        field: "user_id",
        operator: "=",
        value: "user-abc",
      }),
    ]);

    await getTracesCountForPublicApi({ projectId: "proj-1", filter });

    expect(mockQueryClickhouse).toHaveBeenCalledOnce();
    const { query } = mockQueryClickhouse.mock.calls[0][0];
    expect(query).not.toContain("FINAL");
  });

  it("uses FINAL when an observations-table filter is present", async () => {
    const filter = new FilterList([
      new StringFilter({
        clickhouseTable: "observations",
        field: "name",
        operator: "=",
        value: "obs-span",
      }),
    ]);

    await getTracesCountForPublicApi({ projectId: "proj-1", filter });

    expect(mockQueryClickhouse).toHaveBeenCalledOnce();
    const { query } = mockQueryClickhouse.mock.calls[0][0];
    expect(query).toMatch(/FROM\s+traces\s+t\s+FINAL/);
  });

  it("pushes score names down for filter-only count queries", async () => {
    await getTracesCountForPublicApi({
      projectId: "proj-1",
      filter: makeScoreFilter(),
    });

    const { query, params } = mockQueryClickhouse.mock.calls[0][0];
    expect(query).toContain("name IN ({");
    expect(Object.values(params)).toContainEqual(["quality"]);
  });

  it("keeps all score ids when scores are selected", async () => {
    await generateTracesForPublicApi({
      projectId: "proj-1",
      filter: makeScoreFilter(),
      orderBy: null,
      fields: ["core", "scores"],
    });

    const { query } = mockQueryClickhouse.mock.calls[0][0];
    expect(query).not.toContain("name IN ({");
  });
});
