import { describe, it, expect, beforeEach, vi } from "vitest";

// The blob-export builders must filter their time window half-open:
// `timestamp >= minTimestamp AND timestamp < maxTimestamp`. Every run/chunk
// handoff sets the next window's inclusive `minTimestamp` to the previous
// window's `maxTimestamp` (lastSyncAt = maxTimestamp). With an inclusive upper
// bound a row landing exactly on the boundary was exported in BOTH adjacent
// windows (duplicate); with a half-open upper bound it moves to the next window
// and is exported exactly once. See the analytics-integration exporters, which
// already use `< maxTimestamp`.

const mockQueryClickhouseStream = vi.hoisted(() =>
  vi.fn(() => (async function* () {})()),
);

vi.mock("./clickhouse", () => ({
  queryClickhouse: vi.fn(),
  queryClickhouseStream: mockQueryClickhouseStream,
  queryClickhouseStreamRawText: mockQueryClickhouseStream,
  queryClickhouseExecRaw: vi.fn(),
  commandClickhouse: vi.fn(),
  upsertClickhouse: vi.fn(),
  parseClickhouseUTCDateTimeFormat: vi.fn(),
  clickhouseCompliantRandomCharacters: vi.fn(() => "x"),
  BLOB_EXPORT_PARQUET_CLICKHOUSE_SETTINGS: {},
}));

// Break the query-options -> server-barrel import cycle and avoid a real
// ClickHouse round-trip for the observations FINAL decision.
vi.mock("../queries/clickhouse-sql/query-options", () => ({
  shouldSkipObservationsFinal: vi.fn().mockResolvedValue(false),
}));

import { getTracesForBlobStorageExport } from "./traces";
import { getObservationsForBlobStorageExport } from "./observations";
import { getScoresForBlobStorageExport } from "./scores";
import { getEventsForBlobStorageExport } from "./events";

const PROJECT = "proj-1";
const MIN = new Date("2026-01-01T00:00:00.000Z");
const MAX = new Date("2026-01-01T01:00:00.000Z");

const capturedQuery = (): string => {
  expect(mockQueryClickhouseStream).toHaveBeenCalledTimes(1);
  const call = mockQueryClickhouseStream.mock.calls[0] as unknown as [
    { query: string },
  ];
  return call[0].query;
};

const builders = [
  {
    name: "getTracesForBlobStorageExport",
    run: async () => {
      getTracesForBlobStorageExport(PROJECT, MIN, MAX);
    },
  },
  {
    name: "getObservationsForBlobStorageExport",
    // async generator: iterate once to run the body up to the yield*
    run: async () => {
      await getObservationsForBlobStorageExport(PROJECT, MIN, MAX).next();
    },
  },
  {
    name: "getScoresForBlobStorageExport",
    run: async () => {
      getScoresForBlobStorageExport(PROJECT, MIN, MAX);
    },
  },
  {
    name: "getEventsForBlobStorageExport",
    run: async () => {
      getEventsForBlobStorageExport(PROJECT, MIN, MAX);
    },
  },
];

describe("blob-storage export window is half-open", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(builders)(
    "$name uses an exclusive upper bound and inclusive lower bound",
    async ({ run }) => {
      await run();
      const query = capturedQuery();

      // Inclusive lower bound
      expect(query).toContain(">= {minTimestamp");
      // Exclusive upper bound
      expect(query).toContain("< {maxTimestamp");
      // Never inclusive on the upper bound — that is the double-count bug
      expect(query).not.toContain("<= {maxTimestamp");
    },
  );

  it("boundary row belongs to the next window only (traces)", async () => {
    // Window 1: [MIN, MAX). A row at exactly MAX is excluded here...
    getTracesForBlobStorageExport(PROJECT, MIN, MAX);
    const window1 = capturedQuery();
    expect(window1).toContain("< {maxTimestamp");

    vi.clearAllMocks();

    // ...and included in window 2, whose inclusive minTimestamp = prior MAX.
    const next = new Date("2026-01-01T02:00:00.000Z");
    getTracesForBlobStorageExport(PROJECT, MAX, next);
    const window2 = capturedQuery();
    expect(window2).toContain(">= {minTimestamp");
  });
});
