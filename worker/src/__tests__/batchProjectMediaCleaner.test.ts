import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@langfuse/shared/src/db";
import {
  createOrgProjectAndApiKey,
  deleteMediaByProjectId,
  removeIngestionEventsFromS3AndDeleteClickhouseRefsForProject,
  redis,
} from "@langfuse/shared/src/server";
import {
  BatchProjectMediaCleaner,
  BATCH_PROJECT_MEDIA_CLEANER_LOCK_KEY,
} from "../features/batch-project-media-cleaner";

vi.mock("@langfuse/shared/src/server", async () => {
  const actual = await vi.importActual("@langfuse/shared/src/server");
  return {
    ...actual,
    deleteMediaByProjectId: vi.fn(),
    removeIngestionEventsFromS3AndDeleteClickhouseRefsForProject: vi.fn(),
  };
});

vi.mock("../env", async () => {
  const actual = await vi.importActual("../env");
  return {
    env: {
      ...(actual as { env: object }).env,
      LANGFUSE_BATCH_PROJECT_MEDIA_CLEANER_INTERVAL_MS: 60_000,
      LANGFUSE_BATCH_PROJECT_MEDIA_CLEANER_SLEEP_ON_EMPTY_MS: 300_000,
      LANGFUSE_BATCH_PROJECT_MEDIA_CLEANER_PROJECT_LIMIT: 1000,
      LANGFUSE_BATCH_PROJECT_MEDIA_CLEANER_MEDIA_BATCH_SIZE: 2,
      LANGFUSE_ENABLE_BLOB_STORAGE_FILE_LOG: "true",
    },
  };
});

async function createMedia(projectId: string, count: number) {
  for (let i = 0; i < count; i++) {
    const id = randomUUID();
    await prisma.media.create({
      data: {
        id,
        projectId,
        sha256Hash: `hash-${randomUUID()}`.padEnd(44, "0"),
        bucketPath: `projects/${projectId}/media/${id}`,
        bucketName: "test-bucket",
        contentType: "image/png",
        contentLength: 1024,
      },
    });
  }
}

describe("BatchProjectMediaCleaner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(deleteMediaByProjectId).mockImplementation(async (params) => {
      const media = await prisma.media.findMany({
        where: { projectId: params.projectId },
        select: { id: true },
        take: params.limit,
      });

      if (media.length === 0) {
        return 0;
      }

      await prisma.media.deleteMany({
        where: {
          projectId: params.projectId,
          id: { in: media.map((m) => m.id) },
        },
      });

      return media.length;
    });
    vi.mocked(
      removeIngestionEventsFromS3AndDeleteClickhouseRefsForProject,
    ).mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await redis?.del(BATCH_PROJECT_MEDIA_CLEANER_LOCK_KEY);
  });

  it("deletes media for soft-deleted project", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    await prisma.project.update({
      where: { id: projectId },
      data: { deletedAt: new Date() },
    });
    await createMedia(projectId, 2);

    const cleaner = new BatchProjectMediaCleaner();
    const delay = await cleaner.processBatch();

    expect(delay).toBe(60_000);
    expect(await prisma.media.count({ where: { projectId } })).toBe(0);
    expect(deleteMediaByProjectId).toHaveBeenCalledWith({
      projectId,
      limit: 2,
    });
  });

  it("skips active projects", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    await createMedia(projectId, 2);

    const cleaner = new BatchProjectMediaCleaner();
    const delay = await cleaner.processBatch();

    expect(delay).toBe(300_000);
    expect(deleteMediaByProjectId).not.toHaveBeenCalled();
    expect(await prisma.media.count({ where: { projectId } })).toBe(2);
  });

  it("continues blob cleanup if media cleanup fails", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    await prisma.project.update({
      where: { id: projectId },
      data: { deletedAt: new Date() },
    });
    await createMedia(projectId, 1);

    vi.mocked(deleteMediaByProjectId).mockRejectedValueOnce(
      new Error("media cleanup failed"),
    );

    const cleaner = new BatchProjectMediaCleaner();
    const delay = await cleaner.processBatch();

    expect(delay).toBe(60_000);
    expect(
      removeIngestionEventsFromS3AndDeleteClickhouseRefsForProject,
    ).toHaveBeenCalledWith(projectId, undefined);
  });

  it("continues media cleanup if blob cleanup fails", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    await prisma.project.update({
      where: { id: projectId },
      data: { deletedAt: new Date() },
    });
    await createMedia(projectId, 1);

    vi.mocked(
      removeIngestionEventsFromS3AndDeleteClickhouseRefsForProject,
    ).mockRejectedValueOnce(new Error("blob cleanup failed"));

    const cleaner = new BatchProjectMediaCleaner();
    const delay = await cleaner.processBatch();

    expect(delay).toBe(60_000);
    expect(deleteMediaByProjectId).toHaveBeenCalled();
    expect(await prisma.media.count({ where: { projectId } })).toBe(0);
  });

  it("respects batch size limit", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    await prisma.project.update({
      where: { id: projectId },
      data: { deletedAt: new Date() },
    });
    await createMedia(projectId, 5);

    const cleaner = new BatchProjectMediaCleaner();
    await cleaner.processBatch();

    expect(await prisma.media.count({ where: { projectId } })).toBe(3);
  });

  it("respects project limit when selecting deleted projects", async () => {
    const cleaner = new BatchProjectMediaCleaner();

    const queryRawSpy = vi.spyOn(prisma, "$queryRaw").mockResolvedValueOnce([]);

    const delay = await cleaner.processBatch();

    expect(delay).toBe(300_000);
    expect(deleteMediaByProjectId).not.toHaveBeenCalled();
    expect(queryRawSpy).toHaveBeenCalledTimes(1);

    queryRawSpy.mockRestore();
  });

  it("returns sleep interval when no work and interval when work exists", async () => {
    const cleaner = new BatchProjectMediaCleaner();
    const emptyDelay = await cleaner.processBatch();

    expect(emptyDelay).toBe(300_000);

    const { projectId } = await createOrgProjectAndApiKey();
    await prisma.project.update({
      where: { id: projectId },
      data: { deletedAt: new Date() },
    });
    await createMedia(projectId, 1);

    const workDelay = await cleaner.processBatch();
    expect(workDelay).toBe(60_000);
  });
});
