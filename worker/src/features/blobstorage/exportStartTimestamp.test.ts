import { describe, expect, it } from "vitest";
import { BlobStorageExportMode } from "@langfuse/shared";
import {
  clampBlobExportStart,
  resolveBlobExportMinTimestamp,
} from "./exportStartTimestamp";

const NOW = new Date("2026-08-28T12:00:00.000Z");
const PROJECT_CREATED_AT = new Date("2024-06-01T00:00:00.000Z");
const EPOCH = new Date(0);

describe("clampBlobExportStart", () => {
  it("returns the start when it is on or after project createdAt", () => {
    const start = new Date("2025-01-01T00:00:00.000Z");
    expect(clampBlobExportStart(start, PROJECT_CREATED_AT)).toEqual(start);
  });

  it("floors a start older than project createdAt", () => {
    expect(clampBlobExportStart(EPOCH, PROJECT_CREATED_AT)).toEqual(
      PROJECT_CREATED_AT,
    );
  });
});

describe("resolveBlobExportMinTimestamp", () => {
  const base = {
    exportStartDate: null as Date | null,
    historicalMinTimestampMs: null as number | null,
    projectCreatedAt: PROJECT_CREATED_AT,
    now: NOW,
  };

  it("starts a first FULL_HISTORY export at now when ClickHouse has no rows", () => {
    const result = resolveBlobExportMinTimestamp({
      ...base,
      lastSyncAt: null,
      exportMode: BlobStorageExportMode.FULL_HISTORY,
    });

    expect(result).toEqual(NOW);
    expect(result.getTime()).not.toBe(0);
  });

  it("does not fall back to project createdAt when an old project has no data", () => {
    // An old empty project must skip, not walk createdAt → now empty windows.
    const result = resolveBlobExportMinTimestamp({
      ...base,
      lastSyncAt: null,
      exportMode: BlobStorageExportMode.FULL_HISTORY,
      projectCreatedAt: new Date("2024-01-15T00:00:00.000Z"),
    });

    expect(result).toEqual(NOW);
  });

  it("uses the ClickHouse min timestamp for FULL_HISTORY when data exists", () => {
    const min = new Date("2025-03-01T00:00:00.000Z");
    const result = resolveBlobExportMinTimestamp({
      ...base,
      lastSyncAt: null,
      exportMode: BlobStorageExportMode.FULL_HISTORY,
      historicalMinTimestampMs: min.getTime(),
    });

    expect(result).toEqual(min);
  });

  it("clamps a ClickHouse min timestamp older than project createdAt", () => {
    const result = resolveBlobExportMinTimestamp({
      ...base,
      lastSyncAt: null,
      exportMode: BlobStorageExportMode.FULL_HISTORY,
      historicalMinTimestampMs: new Date("2020-01-01T00:00:00.000Z").getTime(),
    });

    expect(result).toEqual(PROJECT_CREATED_AT);
  });

  it("treats a zero ClickHouse min timestamp as no data and starts at now", () => {
    const result = resolveBlobExportMinTimestamp({
      ...base,
      lastSyncAt: null,
      exportMode: BlobStorageExportMode.FULL_HISTORY,
      historicalMinTimestampMs: 0,
    });

    expect(result).toEqual(NOW);
  });

  it("clamps a custom start date older than project createdAt", () => {
    const result = resolveBlobExportMinTimestamp({
      ...base,
      lastSyncAt: null,
      exportMode: BlobStorageExportMode.FROM_CUSTOM_DATE,
      exportStartDate: EPOCH,
    });

    expect(result).toEqual(PROJECT_CREATED_AT);
  });

  it("preserves a custom start date on or after project createdAt", () => {
    const custom = new Date("2025-02-01T00:00:00.000Z");
    const result = resolveBlobExportMinTimestamp({
      ...base,
      lastSyncAt: null,
      exportMode: BlobStorageExportMode.FROM_CUSTOM_DATE,
      exportStartDate: custom,
    });

    expect(result).toEqual(custom);
  });

  it("clamps lastSyncAt older than project createdAt", () => {
    const result = resolveBlobExportMinTimestamp({
      ...base,
      lastSyncAt: EPOCH,
      exportMode: BlobStorageExportMode.FULL_HISTORY,
    });

    expect(result).toEqual(PROJECT_CREATED_AT);
  });

  it("preserves lastSyncAt on or after project createdAt", () => {
    const lastSyncAt = new Date("2025-07-01T00:00:00.000Z");
    const result = resolveBlobExportMinTimestamp({
      ...base,
      lastSyncAt,
      exportMode: BlobStorageExportMode.FULL_HISTORY,
    });

    expect(result).toEqual(lastSyncAt);
  });

  it("uses exportStartDate for FROM_TODAY", () => {
    const today = new Date("2026-08-28T00:00:00.000Z");
    const result = resolveBlobExportMinTimestamp({
      ...base,
      lastSyncAt: null,
      exportMode: BlobStorageExportMode.FROM_TODAY,
      exportStartDate: today,
    });

    expect(result).toEqual(today);
  });
});
