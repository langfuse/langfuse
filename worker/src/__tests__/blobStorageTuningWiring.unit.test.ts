import { describe, expect, it, vi, beforeEach } from "vitest";
import { Readable } from "stream";

// Records of every uploadFileBuffered call so we can assert the resolved tuning
// was threaded through. Hoisted so the module mock can close over it.
const uploadCalls = vi.hoisted(() => [] as any[]);

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    blobStorageIntegration: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    project: { findUnique: vi.fn().mockResolvedValue({ name: "p" }) },
  },
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  async function* empty(): AsyncGenerator<Record<string, unknown>> {
    // no rows
  }
  return {
    ...mod,
    StorageServiceFactory: {
      getInstance: () => ({
        uploadFileBuffered: vi.fn(async (params: any) => {
          uploadCalls.push(params);
          // Drain the pipeline stream so it does not hang.
          for await (const _chunk of params.data) {
            void _chunk;
          }
          return undefined;
        }),
      }),
    },
    getTracesForBlobStorageExport: () => empty(),
    getObservationsForBlobStorageExport: () => empty(),
    getScoresForBlobStorageExport: () => empty(),
    getEventsForBlobStorageExport: () => empty(),
    // LFE-10463 Parquet path: each returns an already-resolved
    // { stream } (the binary body) — a tiny Readable with the Parquet magic.
    getTracesForBlobStorageExportParquet: async () => ({
      queryId: "q",
      stream: Readable.from([Buffer.from("PAR1")]),
      responseHeaders: {},
    }),
    getScoresForBlobStorageExportParquet: async () => ({
      queryId: "q",
      stream: Readable.from([Buffer.from("PAR1")]),
      responseHeaders: {},
    }),
    getObservationsForBlobStorageExportParquet: async () => ({
      queryId: "q",
      stream: Readable.from([Buffer.from("PAR1")]),
      responseHeaders: {},
    }),
    getEventsForBlobStorageExportParquet: async () => ({
      queryId: "q",
      stream: Readable.from([Buffer.from("PAR1")]),
      responseHeaders: {},
    }),
    createModelCache: () => ({ getModel: async () => null }),
    blobStorageEndpointConnectionValidationOptions: () => undefined,
  };
});

import { prisma } from "@langfuse/shared/src/db";
import { handleBlobStorageIntegrationProjectJob } from "../features/blobstorage/handleBlobStorageIntegrationProjectJob";
import type { Job } from "bullmq";

function makeJob(): Job<any> {
  return {
    id: "job-1",
    attemptsMade: 0,
    data: { id: "payload-1", payload: { projectId: "project-1" } },
  } as unknown as Job<any>;
}

function baseRow(exportTuning: unknown) {
  return {
    projectId: "project-1",
    type: "S3",
    bucketName: "bucket",
    prefix: "",
    accessKeyId: "k",
    secretAccessKey: null,
    region: "auto",
    endpoint: null,
    forcePathStyle: false,
    enabled: true,
    exportFrequency: "daily",
    fileType: "CSV",
    exportMode: "FROM_CUSTOM_DATE",
    exportStartDate: new Date(Date.now() - 2 * 60 * 60 * 1000),
    exportSource: "TRACES_OBSERVATIONS", // legacy, non-enriched → no gate
    exportFieldGroups: ["core"],
    compressed: false,
    // 2h ago so minTimestamp = lastSyncAt and we skip the ClickHouse min query.
    lastSyncAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    createdAt: new Date("2026-01-01T00:00:00Z"),
    exportTuning,
  };
}

describe("handleBlobStorageIntegrationProjectJob tuning wiring", () => {
  beforeEach(() => {
    uploadCalls.length = 0;
    vi.clearAllMocks();
  });

  it("clamps out-of-range tuning and threads it into uploadFileBuffered", async () => {
    (prisma.blobStorageIntegration.findUnique as any).mockResolvedValue(
      baseRow({
        partSizeBytes: 1024, // below 5 MiB floor → clamped up
        maxConcurrentParts: 50, // above 32 ceiling → clamped to 32
        maxPartAttempts: 7, // in range
        skipEnrichment: true,
      }),
    );

    await handleBlobStorageIntegrationProjectJob(makeJob());

    expect(uploadCalls.length).toBeGreaterThan(0);
    for (const call of uploadCalls) {
      expect(call.partSizeBytes).toBe(5 * 1024 * 1024); // floor
      expect(call.maxConcurrentParts).toBe(32); // ceiling
      expect(call.maxPartAttempts).toBe(7);
      expect(call.stats).toEqual({
        partsUploaded: 0,
        partRetries: 0,
        partFailures: 0,
      });
    }
  });

  it("uses defaults when exportTuning is null", async () => {
    (prisma.blobStorageIntegration.findUnique as any).mockResolvedValue(
      baseRow(null),
    );

    await handleBlobStorageIntegrationProjectJob(makeJob());

    expect(uploadCalls.length).toBeGreaterThan(0);
    for (const call of uploadCalls) {
      expect(call.partSizeBytes).toBe(100 * 1024 * 1024); // 100 MiB default
      // Concurrency/attempts are undefined when unset so each StorageService
      // backend keeps its native default (Azure 5, buffered S3 env, etc.).
      expect(call.maxConcurrentParts).toBeUndefined();
      expect(call.maxPartAttempts).toBeUndefined();
    }
  });

  // LFE-10463: parquet tuning routes every table through the Parquet path,
  // overriding fileType (CSV here) and the .gz suffix.
  it("produces .parquet files with the parquet content type when parquet is enabled", async () => {
    (prisma.blobStorageIntegration.findUnique as any).mockResolvedValue(
      baseRow({ parquet: true }),
    );

    await handleBlobStorageIntegrationProjectJob(makeJob());

    // exportSource TRACES_OBSERVATIONS → scores, traces, observations.
    expect(uploadCalls.length).toBe(3);
    for (const call of uploadCalls) {
      expect(call.fileName.endsWith(".parquet")).toBe(true);
      expect(call.fileName.endsWith(".gz")).toBe(false);
      expect(call.fileType).toBe("application/vnd.apache.parquet");
    }
  });

  it("ignores the compressed flag on the parquet path (no .gz suffix)", async () => {
    (prisma.blobStorageIntegration.findUnique as any).mockResolvedValue({
      ...baseRow({ parquet: true }),
      compressed: true,
      fileType: "JSONL",
    });

    await handleBlobStorageIntegrationProjectJob(makeJob());

    expect(uploadCalls.length).toBe(3);
    for (const call of uploadCalls) {
      expect(call.fileName.endsWith(".parquet")).toBe(true);
      expect(call.fileName).not.toContain(".gz");
      expect(call.fileType).toBe("application/vnd.apache.parquet");
    }
  });

  it("parquet takes precedence over rawPassthrough", async () => {
    (prisma.blobStorageIntegration.findUnique as any).mockResolvedValue({
      ...baseRow({ parquet: true, rawPassthrough: true }),
      fileType: "JSONL",
    });

    await handleBlobStorageIntegrationProjectJob(makeJob());

    expect(uploadCalls.length).toBe(3);
    for (const call of uploadCalls) {
      expect(call.fileName.endsWith(".parquet")).toBe(true);
      expect(call.fileType).toBe("application/vnd.apache.parquet");
    }
  });
});
