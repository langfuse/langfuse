import { beforeEach, describe, expect, it, vi } from "vitest";

// The tracker only needs a logger; stub the heavy shared server barrel.
vi.mock("@langfuse/shared/src/server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  registerInFlightBlobExport,
  unregisterInFlightBlobExport,
  getInFlightBlobExportCount,
  logInFlightBlobExportsOnShutdown,
  resetInFlightBlobExports,
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
  beforeEach(() => resetInFlightBlobExports());

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
});
