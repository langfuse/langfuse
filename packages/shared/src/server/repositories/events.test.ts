import { describe, it, expect, beforeEach, vi } from "vitest";

const mockQueryClickhouse = vi.hoisted(() => vi.fn());
let charCounter = 0;

vi.mock("./clickhouse", () => ({
  queryClickhouse: mockQueryClickhouse,
  commandClickhouse: vi.fn(),
  queryClickhouseStream: vi.fn(),
  queryClickhouseStreamRawText: vi.fn(),
  queryClickhouseExecRaw: vi.fn(),
  parseClickhouseUTCDateTimeFormat: vi.fn(),
  BLOB_EXPORT_PARQUET_CLICKHOUSE_SETTINGS: {},
  // Return unique names per call so filter parameter variables don't collide
  clickhouseCompliantRandomCharacters: vi.fn(() => `x${++charCounter}`),
}));

import { getObservationsV2FromEventsTableForPublicApi } from "./events";
import { type EventsTableFilterState } from "../../types";

const inputContainsFilter: EventsTableFilterState = [
  { type: "string", column: "input", operator: "contains", value: "needle" },
];

const captureQuery = () => {
  const call = mockQueryClickhouse.mock.calls.at(0);
  return (call?.[0] as { query: string }).query;
};

const baseOpts = { projectId: "proj-1", page: 1, limit: 50 } as const;

describe("getObservationsV2FromEventsTableForPublicApi query shape", () => {
  beforeEach(() => {
    charCounter = 0;
    vi.clearAllMocks();
    mockQueryClickhouse.mockResolvedValue([]);
  });

  it("skips the io-lane split when a content filter forces base onto events_full", async () => {
    await getObservationsV2FromEventsTableForPublicApi(
      {
        ...baseOpts,
        fields: ["core", "io"],
        advancedFilters: inputContainsFilter,
      },
      { allowUnindexedIoFilters: true },
    );

    const query = captureQuery();
    // Single-pass scan on events_full: no base/io CTE split, io read inline.
    expect(query).not.toContain("FROM base");
    expect(query).not.toContain("_io_start_time");
    expect(query).toContain("e.input");
    expect(query).toContain("e.output");
    // Exactly one events_full read (the split would reference it twice).
    expect((query.match(/events_full/g) ?? []).length).toBe(1);
    expect(query).not.toContain("events_core");
  });

  it("keeps the io-lane split when no content filter forces events_full", async () => {
    await getObservationsV2FromEventsTableForPublicApi({
      ...baseOpts,
      fields: ["core", "io"],
    });

    const query = captureQuery();
    // Base filters on the cheap truncated table; io lane reads full columns
    // only for the matched, page-sized rows.
    expect(query).toContain("FROM events_core");
    expect(query).toContain("FROM base");
    expect(query).toContain("_io_start_time");
  });
});
