import { describe, it, expect, beforeEach, vi } from "vitest";

const mockQueryClickhouseStream = vi.hoisted(() => vi.fn());
const mockQueryClickhouseStreamRawText = vi.hoisted(() => vi.fn());
const mockQueryClickhouseExecRaw = vi.hoisted(() => vi.fn());
const mockShouldSkipObservationsFinal = vi.hoisted(() => vi.fn());

vi.mock("./clickhouse", () => ({
  commandClickhouse: vi.fn(),
  parseClickhouseUTCDateTimeFormat: vi.fn(),
  queryClickhouse: vi.fn(),
  queryClickhouseStream: mockQueryClickhouseStream,
  queryClickhouseStreamRawText: mockQueryClickhouseStreamRawText,
  queryClickhouseExecRaw: mockQueryClickhouseExecRaw,
  BLOB_EXPORT_PARQUET_CLICKHOUSE_SETTINGS: {},
  upsertClickhouse: vi.fn(),
}));

vi.mock("../queries/clickhouse-sql/query-options", () => ({
  shouldSkipObservationsFinal: mockShouldSkipObservationsFinal,
}));

import {
  getObservationsForBlobStorageExport,
  getObservationsForBlobStorageExportRaw,
  getObservationsForBlobStorageExportParquet,
} from "./observations";

const DEDUP_ORDER_BY = "ORDER BY event_ts DESC";
const DEDUP_LIMIT_BY = "LIMIT 1 BY id, project_id, type";

const minTimestamp = new Date("2026-07-01T00:00:00.000Z");
const maxTimestamp = new Date("2026-07-02T00:00:00.000Z");

describe("observations blob-export — event_ts dedup skip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockShouldSkipObservationsFinal.mockResolvedValue(false);
    mockQueryClickhouseStream.mockImplementation(async function* () {});
    mockQueryClickhouseStreamRawText.mockImplementation(async function* () {});
    mockQueryClickhouseExecRaw.mockResolvedValue({ stream: {} });
  });

  it("deduplicates by latest event_ts by default", async () => {
    await getObservationsForBlobStorageExport(
      "proj-1",
      minTimestamp,
      maxTimestamp,
    ).next();

    expect(mockShouldSkipObservationsFinal).toHaveBeenCalledWith("proj-1");
    expect(mockQueryClickhouseStream).toHaveBeenCalledOnce();
    const { query } = mockQueryClickhouseStream.mock.calls[0][0];
    expect(query).toContain(DEDUP_ORDER_BY);
    expect(query).toContain(DEDUP_LIMIT_BY);
  });

  it("skips dedup when shouldSkipObservationsFinal returns true", async () => {
    mockShouldSkipObservationsFinal.mockResolvedValue(true);

    await getObservationsForBlobStorageExport(
      "proj-1",
      minTimestamp,
      maxTimestamp,
    ).next();

    expect(mockQueryClickhouseStream).toHaveBeenCalledOnce();
    const { query } = mockQueryClickhouseStream.mock.calls[0][0];
    expect(query).not.toContain(DEDUP_ORDER_BY);
    expect(query).not.toContain(DEDUP_LIMIT_BY);
    expect(query).toContain("WHERE project_id = {projectId: String}");
  });

  it("raw passthrough honors the skip flag", async () => {
    mockShouldSkipObservationsFinal.mockResolvedValue(true);

    await getObservationsForBlobStorageExportRaw(
      "proj-1",
      minTimestamp,
      maxTimestamp,
    ).next();

    expect(mockQueryClickhouseStreamRawText).toHaveBeenCalledOnce();
    const { query } = mockQueryClickhouseStreamRawText.mock.calls[0][0];
    expect(query).not.toContain(DEDUP_LIMIT_BY);
  });

  it("parquet export honors the skip flag", async () => {
    mockShouldSkipObservationsFinal.mockResolvedValue(true);

    await getObservationsForBlobStorageExportParquet(
      "proj-1",
      minTimestamp,
      maxTimestamp,
    );

    expect(mockQueryClickhouseExecRaw).toHaveBeenCalledOnce();
    const { query, format } = mockQueryClickhouseExecRaw.mock.calls[0][0];
    expect(query).not.toContain(DEDUP_LIMIT_BY);
    expect(format).toBe("Parquet");
  });
});
