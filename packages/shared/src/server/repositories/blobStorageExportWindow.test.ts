import { describe, it, expect, beforeEach, vi } from "vitest";

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
    // async generator: iterate once to run the builder
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

      expect(query).toContain(">= {minTimestamp");
      expect(query).toContain("< {maxTimestamp");
      expect(query).not.toContain("<= {maxTimestamp");
    },
  );

  it("boundary row belongs to the next window only (traces)", async () => {
    // Window 1 [MIN, MAX) excludes a row at exactly MAX...
    getTracesForBlobStorageExport(PROJECT, MIN, MAX);
    const window1 = capturedQuery();
    expect(window1).toContain("< {maxTimestamp");

    vi.clearAllMocks();

    // ...window 2's inclusive min = prior MAX includes it.
    const next = new Date("2026-01-01T02:00:00.000Z");
    getTracesForBlobStorageExport(PROJECT, MAX, next);
    const window2 = capturedQuery();
    expect(window2).toContain(">= {minTimestamp");
  });
});
