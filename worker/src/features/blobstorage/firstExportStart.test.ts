import { describe, expect, it } from "vitest";
import { BlobStorageExportMode } from "@langfuse/shared";
import { resolveFirstExportStart } from "./firstExportStart";

const NOW = new Date("2026-08-28T12:00:00.000Z");

describe("resolveFirstExportStart", () => {
  const base = {
    exportStartDate: null as Date | null,
    historicalMinTimestampMs: null as number | null,
    now: NOW,
  };

  it("uses the real ClickHouse min for FULL_HISTORY when data exists", () => {
    const min = new Date("2025-03-01T00:00:00.000Z");
    expect(
      resolveFirstExportStart({
        ...base,
        exportMode: BlobStorageExportMode.FULL_HISTORY,
        historicalMinTimestampMs: min.getTime(),
      }),
    ).toEqual(min);
  });

  it("does not floor a backfilled min that predates a much later project", () => {
    // The reported case: data backfilled years before the project row exists.
    // A full-history export must reach back to the real data minimum.
    const backfilledMin = new Date("2019-01-01T00:00:00.000Z");
    expect(
      resolveFirstExportStart({
        ...base,
        exportMode: BlobStorageExportMode.FULL_HISTORY,
        historicalMinTimestampMs: backfilledMin.getTime(),
      }),
    ).toEqual(backfilledMin);
  });

  it("starts a first FULL_HISTORY export at now when there are no rows", () => {
    expect(
      resolveFirstExportStart({
        ...base,
        exportMode: BlobStorageExportMode.FULL_HISTORY,
      }),
    ).toEqual(NOW);
  });

  it("treats a zero min timestamp as no data and starts at now", () => {
    expect(
      resolveFirstExportStart({
        ...base,
        exportMode: BlobStorageExportMode.FULL_HISTORY,
        historicalMinTimestampMs: 0,
      }),
    ).toEqual(NOW);
  });

  it("uses the custom start date for FROM_CUSTOM_DATE", () => {
    const custom = new Date("2026-01-01T00:00:00.000Z");
    expect(
      resolveFirstExportStart({
        ...base,
        exportMode: BlobStorageExportMode.FROM_CUSTOM_DATE,
        exportStartDate: custom,
      }),
    ).toEqual(custom);
  });

  it("falls back to now for FROM_TODAY without a start date", () => {
    expect(
      resolveFirstExportStart({
        ...base,
        exportMode: BlobStorageExportMode.FROM_TODAY,
      }),
    ).toEqual(NOW);
  });
});
