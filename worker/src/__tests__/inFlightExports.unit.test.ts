import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRecordIncrement = vi.hoisted(() => vi.fn());

// The tracker only needs a logger + metric sink; stub the heavy shared barrel.
vi.mock("@langfuse/shared/src/server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  recordIncrement: mockRecordIncrement,
}));

import {
  registerInFlightBlobExport,
  unregisterInFlightBlobExport,
  getInFlightBlobExportCount,
  logInFlightBlobExportsOnShutdown,
  resetInFlightBlobExports,
  BLOB_TABLE_EXPORT_METRIC,
} from "../features/blobstorage/inFlightExports";

const makeEntry = (table: string) => ({
  jobId: `job-${table}`,
  projectId: "p-1",
  table,
  minTimestamp: "2025-12-01T00:00:00.000Z",
  maxTimestamp: "2025-12-02T00:00:00.000Z",
  startedAt: 1,
});

describe("inFlightExports", () => {
  // Singleton registry — drain it so tests are order-independent.
  beforeEach(() => {
    resetInFlightBlobExports();
    mockRecordIncrement.mockClear();
  });

  it("tracks and clears in-flight exports by handle", () => {
    expect(getInFlightBlobExportCount()).toBe(0);

    const h1 = registerInFlightBlobExport(makeEntry("traces"));
    const h2 = registerInFlightBlobExport(makeEntry("scores"));
    expect(getInFlightBlobExportCount()).toBe(2);

    unregisterInFlightBlobExport(h1);
    expect(getInFlightBlobExportCount()).toBe(1);

    unregisterInFlightBlobExport(h2);
    expect(getInFlightBlobExportCount()).toBe(0);
  });

  it("keeps distinct entries for the same project/table pair", () => {
    const h1 = registerInFlightBlobExport(makeEntry("observations"));
    const h2 = registerInFlightBlobExport(makeEntry("observations"));
    expect(h1).not.toBe(h2);
    expect(getInFlightBlobExportCount()).toBe(2);

    unregisterInFlightBlobExport(h1);
    unregisterInFlightBlobExport(h2);
    expect(getInFlightBlobExportCount()).toBe(0);
  });

  it("logInFlightBlobExportsOnShutdown does not throw whether empty or populated", () => {
    expect(() => logInFlightBlobExportsOnShutdown()).not.toThrow();

    const h = registerInFlightBlobExport(makeEntry("traces"));
    expect(() => logInFlightBlobExportsOnShutdown()).not.toThrow();
    unregisterInFlightBlobExport(h);
  });

  it("emits an aborted increment per in-flight export on shutdown", () => {
    // Empty registry: nothing to abort.
    logInFlightBlobExportsOnShutdown();
    expect(mockRecordIncrement).not.toHaveBeenCalled();

    const h1 = registerInFlightBlobExport(makeEntry("observations_v2"));
    const h2 = registerInFlightBlobExport(makeEntry("scores"));

    logInFlightBlobExportsOnShutdown();

    expect(mockRecordIncrement).toHaveBeenCalledTimes(2);
    expect(mockRecordIncrement).toHaveBeenCalledWith(
      BLOB_TABLE_EXPORT_METRIC,
      1,
      {
        outcome: "aborted",
        abortReason: "shutdown",
        table: "observations_v2",
      },
    );
    expect(mockRecordIncrement).toHaveBeenCalledWith(
      BLOB_TABLE_EXPORT_METRIC,
      1,
      {
        outcome: "aborted",
        abortReason: "shutdown",
        table: "scores",
      },
    );

    unregisterInFlightBlobExport(h1);
    unregisterInFlightBlobExport(h2);
  });
});
