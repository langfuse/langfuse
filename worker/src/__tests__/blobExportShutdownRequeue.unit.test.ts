import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    blobStorageIntegration: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    project: { findUnique: vi.fn().mockResolvedValue({ name: "p" }) },
  },
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();

  // A long export: rows keep arriving until the pipeline is torn down.
  async function* endless(): AsyncGenerator<Record<string, unknown>> {
    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      yield { id: "row" };
    }
  }

  return {
    ...mod,
    recordIncrement: vi.fn(),
    logger: { ...mod.logger, info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    StorageServiceFactory: {
      getInstance: () => ({
        uploadFileBuffered: vi.fn(async (params: any) => {
          for await (const _chunk of params.data) {
            void _chunk;
          }
        }),
      }),
    },
    getTracesForBlobStorageExport: () => endless(),
    getScoresForBlobStorageExport: () => endless(),
    getObservationsForBlobStorageExport: () => endless(),
    createModelCache: () => ({ getModel: async () => null }),
    blobStorageEndpointConnectionValidationOptions: () => undefined,
  };
});

import { DelayedError, type Job } from "bullmq";
import { prisma } from "@langfuse/shared/src/db";
import { QueueJobs } from "@langfuse/shared/src/server";
import { blobStorageIntegrationProcessingProcessor } from "../queues/blobStorageIntegrationQueue";
import {
  abortBlobExportsForShutdown,
  resetBlobExportShutdown,
} from "../features/blobstorage/inFlightExports";

describe("blob export on worker shutdown", () => {
  afterEach(() => {
    resetBlobExportShutdown();
    vi.clearAllMocks();
  });

  it("re-queues the running job without recording an export error", async () => {
    (prisma.blobStorageIntegration.findUnique as any).mockResolvedValue({
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
      fileType: "JSONL",
      exportMode: "FROM_CUSTOM_DATE",
      exportStartDate: new Date(Date.now() - 2 * 60 * 60 * 1000),
      exportSource: "TRACES_OBSERVATIONS",
      exportFieldGroups: ["core"],
      compressed: false,
      lastSyncAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      createdAt: new Date("2026-01-01T00:00:00Z"),
      exportTuning: null,
    });
    const moveToDelayed = vi.fn().mockResolvedValue(undefined);
    const job = {
      id: "job-1",
      name: QueueJobs.BlobStorageIntegrationProcessingJob,
      attemptsMade: 0,
      data: { id: "payload-1", payload: { projectId: "project-1" } },
      token: "lock-token",
      moveToDelayed,
    } as unknown as Job;

    // No token argument: production calls the processor through
    // WorkerManager.metricWrapper, which passes only the job.
    const run = blobStorageIntegrationProcessingProcessor(job);
    await new Promise((resolve) => setTimeout(resolve, 50));
    abortBlobExportsForShutdown();

    await expect(run).rejects.toBeInstanceOf(DelayedError);
    expect(moveToDelayed).toHaveBeenCalledWith(
      expect.any(Number),
      "lock-token",
    );
    expect(prisma.blobStorageIntegration.update).not.toHaveBeenCalled();
    expect(prisma.blobStorageIntegration.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastError: expect.anything() }),
      }),
    );
  });
});
