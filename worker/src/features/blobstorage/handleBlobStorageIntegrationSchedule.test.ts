import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMany, addBulk, recordDistribution } = vi.hoisted(() => ({
  findMany: vi.fn(),
  addBulk: vi.fn(),
  recordDistribution: vi.fn(),
}));

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: { blobStorageIntegration: { findMany } },
}));

vi.mock("@langfuse/shared/src/server", () => ({
  BlobStorageIntegrationProcessingQueue: {
    getInstance: () => ({ addBulk, clean: vi.fn() }),
  },
  QueueJobs: { BlobStorageIntegrationProcessingJob: "job" },
  logger: { info: vi.fn() },
  recordDistribution,
}));

import { handleBlobStorageIntegrationSchedule } from "./handleBlobStorageIntegrationSchedule";
import { EXPORT_STALENESS_METRIC } from "../../services/exportStalenessMetric";

describe("handleBlobStorageIntegrationSchedule", () => {
  const now = new Date("2026-09-28T12:00:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ now });
  });

  it("emits staleness for every enabled integration but enqueues only due ones", async () => {
    findMany.mockResolvedValue([
      {
        id: "integration-due-a",
        projectId: "shared-project",
        exportFrequency: "every_20_minutes",
        lastSyncAt: new Date("2026-09-28T11:20:00.000Z"),
        nextSyncAt: new Date("2026-09-28T11:59:00.000Z"),
      },
      {
        id: "integration-due-b",
        projectId: "shared-project",
        exportFrequency: "hourly",
        lastSyncAt: new Date("2026-09-28T10:00:00.000Z"),
        nextSyncAt: new Date("2026-09-28T11:30:00.000Z"),
      },
      {
        // Stalled: watermark is a day old but nextSyncAt says not due.
        id: "integration-stalled",
        projectId: "stalled",
        exportFrequency: "hourly",
        lastSyncAt: new Date("2026-09-27T12:00:00.000Z"),
        nextSyncAt: new Date("2026-09-28T13:00:00.000Z"),
      },
      {
        id: "integration-never-synced",
        projectId: "never-synced",
        exportFrequency: "daily",
        lastSyncAt: null,
        nextSyncAt: null,
      },
    ]);

    await handleBlobStorageIntegrationSchedule();

    expect(recordDistribution.mock.calls).toEqual([
      [
        EXPORT_STALENESS_METRIC,
        40 * 60,
        { integration: "blob_storage", window: "20m", unit: "seconds" },
      ],
      [
        EXPORT_STALENESS_METRIC,
        2 * 60 * 60,
        { integration: "blob_storage", window: "1h", unit: "seconds" },
      ],
      [
        EXPORT_STALENESS_METRIC,
        24 * 60 * 60,
        { integration: "blob_storage", window: "1h", unit: "seconds" },
      ],
    ]);
    expect(addBulk).toHaveBeenCalledWith([
      expect.objectContaining({
        data: expect.objectContaining({
          payload: {
            projectId: "integration-due-a",
            integrationId: "integration-due-a",
            ownerProjectId: "shared-project",
          },
        }),
        opts: {
          jobId: "integration-due-a-2026-09-28T11:20:00.000Z",
          removeOnFail: true,
        },
      }),
      expect.objectContaining({
        data: expect.objectContaining({
          payload: {
            projectId: "integration-due-b",
            integrationId: "integration-due-b",
            ownerProjectId: "shared-project",
          },
        }),
        opts: {
          jobId: "integration-due-b-2026-09-28T10:00:00.000Z",
          removeOnFail: true,
        },
      }),
      expect.objectContaining({
        data: expect.objectContaining({
          payload: {
            projectId: "integration-never-synced",
            integrationId: "integration-never-synced",
            ownerProjectId: "never-synced",
          },
        }),
        opts: {
          jobId: "integration-never-synced-",
          removeOnFail: true,
        },
      }),
    ]);
  });

  it("emits staleness even when nothing is due", async () => {
    findMany.mockResolvedValue([
      {
        id: "integration-stalled",
        projectId: "stalled",
        exportFrequency: "monthly",
        lastSyncAt: new Date("2026-09-28T10:00:00.000Z"),
        nextSyncAt: new Date("2026-09-28T13:00:00.000Z"),
      },
    ]);

    await handleBlobStorageIntegrationSchedule();

    expect(recordDistribution).toHaveBeenCalledWith(
      EXPORT_STALENESS_METRIC,
      2 * 60 * 60,
      { integration: "blob_storage", window: "unknown", unit: "seconds" },
    );
    expect(addBulk).not.toHaveBeenCalled();
  });
});
