import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  datasetLinks: vi.fn().mockResolvedValue([]),
  traceLinks: vi.fn().mockResolvedValue([{ mediaId: "media-1" }]),
  observationLinks: vi.fn().mockResolvedValue([]),
  deleteTraceLinks: vi.fn().mockResolvedValue({ count: 0 }),
  deleteObservationLinks: vi.fn().mockResolvedValue({ count: 0 }),
  deleteDatasetLinks: vi.fn().mockResolvedValue({ count: 0 }),
  deleteMedia: vi.fn().mockResolvedValue({ count: 0 }),
  lockedMedia: vi
    .fn()
    .mockResolvedValue([{ id: "media-1", bucketPath: "media/media-1.png" }]),
  transaction: vi.fn(),
}));

vi.mock("../db", () => {
  const tx = {
    $queryRaw: mocks.lockedMedia,
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
  };
  mocks.transaction.mockImplementation(async (callback) => callback(tx));
  return { prisma: { ...tx, $transaction: mocks.transaction } };
});

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
  expect(mocks.lockedMedia).toHaveBeenCalledOnce();
  expect(mocks.traceLinks).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ createdAt: { gt: cutoffDate } }),
    }),
  );
});

it("keeps expired media while a recent dataset upload is pending", async () => {
  const cutoffDate = new Date("2026-09-16T00:00:00Z");
  const deleteFiles = vi.fn().mockResolvedValue(undefined);
  mocks.datasetLinks.mockResolvedValueOnce([{ mediaId: "media-1" }]);
  mocks.traceLinks.mockResolvedValueOnce([]);

  await expect(
    deleteMediaFiles({
      projectId: "project-1",
      mediaFiles: [{ id: "media-1", bucketPath: "media/media-1.png" }],
      storageClient: { deleteFiles },
      linkCleanupCutoffDate: cutoffDate,
    }),
  ).resolves.toBe(0);

  expect(deleteFiles).not.toHaveBeenCalled();
  expect(mocks.datasetLinks).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([{ createdAt: { gt: cutoffDate } }]),
      }),
    }),
  );
});
