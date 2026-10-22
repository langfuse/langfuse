import { describe, it, expect, beforeEach, vi } from "vitest";

type CapturedCall = { query: string; params: Record<string, unknown> };

const mockQueryClickhouseStream = vi.hoisted(() =>
  vi.fn((_call: CapturedCall) => (async function* () {})()),
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
import { convertDateToClickhouseDateTime } from "../clickhouse/client";

const PROJECT = "proj-1";
const MIN = new Date("2026-01-01T00:00:00.000Z");
const MAX = new Date("2026-01-01T01:00:00.000Z");

const capturedCall = (): CapturedCall => {
  expect(mockQueryClickhouseStream).toHaveBeenCalledTimes(1);
  return mockQueryClickhouseStream.mock.calls[0][0];
};

const capturedQuery = (): string => capturedCall().query;

/** The value bound right after `predicate` (e.g. `e.start_time >= `). */
const boundValue = (predicate: string): unknown => {
  const { query, params } = capturedCall();
  const name = query.split(predicate + "{")[1]?.split(":")[0];
  return name === undefined ? undefined : params[name];
};

const namedParamBounds = {
  lower: ">= {minTimestamp",
  upper: "< {maxTimestamp",
  inclusiveUpper: "<= {maxTimestamp",
};

const builders: Array<{
  name: string;
  run: () => Promise<void>;
  bounds?: typeof namedParamBounds;
}> = [
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
    // Query-AST binds are named positionally.
    bounds: {
      lower: "e.start_time >= {",
      upper: "e.start_time < {",
      inclusiveUpper: "e.start_time <= {",
    },
  },
];

describe("blob-storage export window is half-open", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(builders)(
    "$name uses an exclusive upper bound and inclusive lower bound",
    async ({ run, bounds = namedParamBounds }) => {
      await run();
      const query = capturedQuery();

      expect(query).toContain(bounds.lower);
      expect(query).toContain(bounds.upper);
      expect(query).not.toContain(bounds.inclusiveUpper);
    },
  );

  it("getEventsForBlobStorageExport binds min to the lower and max to the upper bound", async () => {
    getEventsForBlobStorageExport(PROJECT, MIN, MAX);

    expect(boundValue("e.start_time >= ")).toBe(
      convertDateToClickhouseDateTime(MIN),
    );
    expect(boundValue("e.start_time < ")).toBe(
      convertDateToClickhouseDateTime(MAX),
    );
  });

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
