import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockFindMany,
  mockGetQueueInstance,
  mockQueueClean,
  mockQueueAddBulk,
  mockLoggerInfo,
} = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockGetQueueInstance: vi.fn(),
  mockQueueClean: vi.fn(),
  mockQueueAddBulk: vi.fn(),
  mockLoggerInfo: vi.fn(),
}));

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    blobStorageIntegration: {
      findMany: mockFindMany,
    },
  },
}));

vi.mock("@langfuse/shared/src/server", () => ({
  BlobStorageIntegrationProcessingQueue: {
    getInstance: mockGetQueueInstance,
  },
  QueueJobs: {
    BlobStorageIntegrationProcessingJob: "BlobStorageIntegrationProcessingJob",
  },
  logger: {
    info: mockLoggerInfo,
  },
}));

describe("handleBlobStorageIntegrationSchedule", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mockQueueClean.mockResolvedValue(undefined);
    mockQueueAddBulk.mockResolvedValue(undefined);
    mockGetQueueInstance.mockReturnValue({
      clean: mockQueueClean,
      addBulk: mockQueueAddBulk,
    });
    mockFindMany.mockResolvedValue([
      {
        projectId: "project-1",
        lastSyncAt: new Date("2025-01-01T00:00:00.000Z"),
      },
    ]);
  });

  it("drains failed legacy jobs once and enqueues processing jobs with removeOnFail", async () => {
    const { handleBlobStorageIntegrationSchedule } = await import(
      "../features/blobstorage/handleBlobStorageIntegrationSchedule"
    );

    await handleBlobStorageIntegrationSchedule();
    await handleBlobStorageIntegrationSchedule();

    expect(mockQueueClean).toHaveBeenCalledTimes(1);
    expect(mockQueueClean).toHaveBeenCalledWith(0, 0, "failed");

    expect(mockQueueAddBulk).toHaveBeenCalledTimes(2);
    const firstAddBulkArg = mockQueueAddBulk.mock.calls[0][0] as Array<{
      opts: { jobId: string; removeOnFail: boolean };
    }>;
    expect(firstAddBulkArg[0].opts).toMatchObject({
      jobId: "project-1-2025-01-01T00:00:00.000Z",
      removeOnFail: true,
    });

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      "[BLOB INTEGRATION] Drained legacy failed jobs from processing queue",
    );
  });
});
