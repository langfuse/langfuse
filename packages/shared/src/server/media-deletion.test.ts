import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  datasetLinks: vi.fn().mockResolvedValue([]),
  traceLinks: vi.fn().mockResolvedValue([{ mediaId: "media-1" }]),
  observationLinks: vi.fn().mockResolvedValue([]),
  deleteTraceLinks: vi.fn().mockResolvedValue({ count: 0 }),
  deleteObservationLinks: vi.fn().mockResolvedValue({ count: 0 }),
  deleteDatasetLinks: vi.fn().mockResolvedValue({ count: 0 }),
  deleteMedia: vi.fn().mockResolvedValue({ count: 0 }),
  transaction: vi.fn(async (operations: Promise<unknown>[]) =>
    Promise.all(operations),
  ),
}));

vi.mock("../db", () => ({
  prisma: {
    datasetItemMedia: {
      findMany: mocks.datasetLinks,
      deleteMany: mocks.deleteDatasetLinks,
    },
    traceMedia: {
      groupBy: mocks.traceLinks,
      deleteMany: mocks.deleteTraceLinks,
    },
    observationMedia: {
      groupBy: mocks.observationLinks,
      deleteMany: mocks.deleteObservationLinks,
    },
    media: { deleteMany: mocks.deleteMedia },
    $transaction: mocks.transaction,
  },
}));

import { deleteMediaFiles } from "./media-deletion";

it("keeps expired media while a recent trace still references it", async () => {
  const cutoffDate = new Date("2026-09-16T00:00:00Z");
  const deleteFiles = vi.fn().mockResolvedValue(undefined);

  const deletedCount = await deleteMediaFiles({
    projectId: "project-1",
    mediaFiles: [{ id: "media-1", bucketPath: "media/media-1.png" }],
    storageClient: { deleteFiles },
    linkCleanupCutoffDate: cutoffDate,
  });

  expect(deletedCount).toBe(0);
  expect(deleteFiles).not.toHaveBeenCalled();
  expect(mocks.traceLinks).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ createdAt: { gt: cutoffDate } }),
    }),
  );
});
