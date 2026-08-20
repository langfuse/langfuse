import { describe, expect, it } from "vitest";
import {
  BLOB_EXPORT_MANIFEST_VERSION,
  buildBlobExportManifest,
  buildBlobExportManifestKey,
  formatBlobExportTimestamp,
  type BlobExportManifestFile,
} from "../features/blobstorage/manifest";

const file = (
  overrides: Partial<BlobExportManifestFile> = {},
): BlobExportManifestFile => ({
  key: "proj/traces/2026-07-10T10-00-00.jsonl",
  table: "traces",
  fileType: "JSONL",
  format: "jsonl-raw",
  compressed: false,
  contentType: "application/x-ndjson; charset=utf-8",
  sizeBytes: 42,
  rowCount: 3,
  ...overrides,
});

describe("blob export manifest builders (LFE-10843)", () => {
  it("strips colons and dots from the timestamp stem and keeps milliseconds", () => {
    expect(
      formatBlobExportTimestamp(new Date("2026-07-10T10:20:30.123Z")),
    ).toBe("2026-07-10T10-20-30-123");
  });

  it("produces distinct keys for timestamps within the same wall-clock second", () => {
    // A caught-up run can emit a full-interval chunk and a sub-second
    // remainder chunk back-to-back; their keys must never collide or the
    // remainder silently overwrites the full window's files.
    const first = formatBlobExportTimestamp(
      new Date("2026-07-10T10:20:30.058Z"),
    );
    const second = formatBlobExportTimestamp(
      new Date("2026-07-10T10:20:30.447Z"),
    );
    expect(first).not.toBe(second);
    expect(
      buildBlobExportManifestKey({
        projectId: "proj",
        maxTimestamp: new Date("2026-07-10T10:20:30.058Z"),
      }),
    ).not.toBe(
      buildBlobExportManifestKey({
        projectId: "proj",
        maxTimestamp: new Date("2026-07-10T10:20:30.447Z"),
      }),
    );
    // Fixed-width stems must preserve chronological lexicographic order.
    expect(first < second).toBe(true);
  });

  it("builds the manifest key under the project's manifests/ prefix", () => {
    expect(
      buildBlobExportManifestKey({
        prefix: "team/",
        projectId: "proj",
        maxTimestamp: new Date("2026-07-10T10:20:30Z"),
      }),
    ).toBe("team/proj/manifests/2026-07-10T10-20-30-000.json");
  });

  it("treats an absent prefix as empty", () => {
    expect(
      buildBlobExportManifestKey({
        projectId: "proj",
        maxTimestamp: new Date("2026-07-10T10:20:30Z"),
      }),
    ).toBe("proj/manifests/2026-07-10T10-20-30-000.json");
  });

  it("assembles the manifest payload with version, window, and distinct tables", () => {
    const manifest = buildBlobExportManifest({
      projectId: "proj",
      exportSource: "TRACES_OBSERVATIONS",
      minTimestamp: new Date("2026-07-10T09:00:00Z"),
      maxTimestamp: new Date("2026-07-10T10:00:00Z"),
      createdAt: new Date("2026-07-10T10:00:05Z"),
      files: [
        file({ table: "scores", key: "proj/scores/x.jsonl" }),
        file({ table: "traces", key: "proj/traces/x.jsonl" }),
        file({ table: "observations", key: "proj/observations/x.jsonl" }),
      ],
    });

    expect(manifest.version).toBe(BLOB_EXPORT_MANIFEST_VERSION);
    expect(manifest.projectId).toBe("proj");
    expect(manifest.exportSource).toBe("TRACES_OBSERVATIONS");
    expect(manifest.window).toEqual({
      minTimestamp: "2026-07-10T09:00:00.000Z",
      maxTimestamp: "2026-07-10T10:00:00.000Z",
    });
    expect(manifest.maxTimestamp).toBe(manifest.window.maxTimestamp);
    expect(manifest.createdAt).toBe("2026-07-10T10:00:05.000Z");
    expect(manifest.tables).toEqual(["scores", "traces", "observations"]);
    expect(manifest.files).toHaveLength(3);
    expect(JSON.parse(JSON.stringify(manifest))).toEqual(manifest);
  });

  it("deduplicates tables while preserving first-seen order", () => {
    const manifest = buildBlobExportManifest({
      projectId: "proj",
      exportSource: "EVENTS",
      minTimestamp: new Date("2026-07-10T09:00:00Z"),
      maxTimestamp: new Date("2026-07-10T10:00:00Z"),
      createdAt: new Date("2026-07-10T10:00:05Z"),
      files: [
        file({ table: "observations_v2" }),
        file({ table: "observations_v2", key: "proj/observations_v2/y.jsonl" }),
      ],
    });
    expect(manifest.tables).toEqual(["observations_v2"]);
  });
});
