import { expect, describe, it, vi, beforeEach, afterEach } from "vitest";
import { randomUUID } from "crypto";
import {
  createOrgProjectAndApiKey,
  getDeletedProjectWithMedia,
  getS3MediaStorageClient,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { BatchProjectMediaCleaner } from "../features/batch-project-media-cleaner";

// Mock S3 storage client and project selection query
vi.mock("@langfuse/shared/src/server", async () => {
  const actual = await vi.importActual("@langfuse/shared/src/server");
  return {
    ...actual,
    getS3MediaStorageClient: vi.fn(),
    getDeletedProjectWithMedia: vi.fn(),
  };
});

// Mock env to enable S3 bucket and set batch size
vi.mock("../env", async () => {
  const actual = await vi.importActual("../env");
  return {
    env: {
      ...(actual as { env: object }).env,
      LANGFUSE_S3_MEDIA_UPLOAD_BUCKET: "test-bucket",
      LANGFUSE_BATCH_PROJECT_MEDIA_CLEANER_BATCH_SIZE: 3,
    },
  };
});

const mockDeleteFiles = vi.fn().mockResolvedValue(undefined);
const mockS3Client = { deleteFiles: mockDeleteFiles };

async function createTestMedia(
  projectId: string,
): Promise<{ id: string; bucketPath: string }> {
  const mediaId = randomUUID();
  const bucketPath = `projects/${projectId}/media/${mediaId}`;

  await prisma.media.create({
    data: {
      id: mediaId,
      projectId,
      sha256Hash: `hash-${randomUUID()}`.padEnd(44, "0"),
      bucketPath,
      bucketName: "test-bucket",
      contentType: "image/png",
      contentLength: 1024,
    },
  });

  return { id: mediaId, bucketPath };
}

async function getMediaCount(projectId: string): Promise<number> {
  return prisma.media.count({ where: { projectId } });
}

describe("BatchProjectMediaCleaner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getS3MediaStorageClient).mockReturnValue(mockS3Client as never);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should delete media for soft-deleted project", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    await prisma.project.update({
      where: { id: projectId },
      data: { deletedAt: new Date() },
    });

    const media1 = await createTestMedia(projectId);
    const media2 = await createTestMedia(projectId);

    vi.mocked(getDeletedProjectWithMedia).mockResolvedValue(projectId);

    expect(await getMediaCount(projectId)).toBe(2);

    const cleaner = new BatchProjectMediaCleaner();
    await cleaner.processBatch();

    expect(await getMediaCount(projectId)).toBe(0);

    const allDeletedPaths = mockDeleteFiles.mock.calls.flatMap(
      (call) => call[0] as string[],
    );
    expect(allDeletedPaths).toContain(media1.bucketPath);
    expect(allDeletedPaths).toContain(media2.bucketPath);
  });

  it("should NOT delete media when no deleted project has media", async () => {
    vi.mocked(getDeletedProjectWithMedia).mockResolvedValue(null);

    const { projectId } = await createOrgProjectAndApiKey();
    await createTestMedia(projectId);

    expect(await getMediaCount(projectId)).toBe(1);

    const cleaner = new BatchProjectMediaCleaner();
    await cleaner.processBatch();

    expect(await getMediaCount(projectId)).toBe(1);
    expect(mockDeleteFiles).not.toHaveBeenCalled();
  });

  it("should process oldest-deleted project first", async () => {
    const { projectId: olderProject } = await createOrgProjectAndApiKey();
    const { projectId: newerProject } = await createOrgProjectAndApiKey();

    await prisma.project.update({
      where: { id: olderProject },
      data: { deletedAt: new Date("2024-01-01") },
    });
    await prisma.project.update({
      where: { id: newerProject },
      data: { deletedAt: new Date("2024-06-01") },
    });

    await createTestMedia(olderProject);
    await createTestMedia(newerProject);

    // Simulate getDeletedProjectWithMedia returning oldest first, then newer
    vi.mocked(getDeletedProjectWithMedia)
      .mockResolvedValueOnce(olderProject)
      .mockResolvedValueOnce(newerProject);

    const processedProjects: string[] = [];
    mockDeleteFiles.mockImplementation(async (paths: string[]) => {
      const match = paths[0]?.match(/projects\/([^/]+)\//);
      if (match && !processedProjects.includes(match[1])) {
        processedProjects.push(match[1]);
      }
    });

    const cleaner1 = new BatchProjectMediaCleaner();
    await cleaner1.processBatch();
    const cleaner2 = new BatchProjectMediaCleaner();
    await cleaner2.processBatch();

    expect(processedProjects).toEqual([olderProject, newerProject]);
  });

  it("should process in chunks respecting batch size", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    await prisma.project.update({
      where: { id: projectId },
      data: { deletedAt: new Date() },
    });

    // Create 5 media items (> batch size of 3)
    for (let i = 0; i < 5; i++) {
      await createTestMedia(projectId);
    }

    vi.mocked(getDeletedProjectWithMedia).mockResolvedValue(projectId);

    expect(await getMediaCount(projectId)).toBe(5);

    // First batch: should delete 3
    const cleaner1 = new BatchProjectMediaCleaner();
    await cleaner1.processBatch();
    expect(await getMediaCount(projectId)).toBe(2);

    // Second batch: should delete remaining 2
    const cleaner2 = new BatchProjectMediaCleaner();
    await cleaner2.processBatch();
    expect(await getMediaCount(projectId)).toBe(0);
  });

  it("should delete from S3 before PostgreSQL", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    await prisma.project.update({
      where: { id: projectId },
      data: { deletedAt: new Date() },
    });

    await createTestMedia(projectId);

    vi.mocked(getDeletedProjectWithMedia).mockResolvedValue(projectId);

    let s3CalledWhileMediaExists = false;

    mockDeleteFiles.mockImplementation(async (paths: string[]) => {
      const count = await prisma.media.count({ where: { projectId } });
      if (count > 0) {
        s3CalledWhileMediaExists = true;
      }
    });

    const cleaner = new BatchProjectMediaCleaner();
    await cleaner.processBatch();

    expect(s3CalledWhileMediaExists).toBe(true);
    expect(await getMediaCount(projectId)).toBe(0);
  });

  it("should preserve PG records when S3 deletion fails", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    await prisma.project.update({
      where: { id: projectId },
      data: { deletedAt: new Date() },
    });

    const media = await createTestMedia(projectId);

    vi.mocked(getDeletedProjectWithMedia).mockResolvedValue(projectId);
    mockDeleteFiles.mockRejectedValue(new Error("S3 unavailable"));

    const cleaner = new BatchProjectMediaCleaner();
    await cleaner.processBatch();

    // PG records must survive — S3 failed before we reached the PG delete
    expect(await getMediaCount(projectId)).toBe(1);

    // Verify S3 was called with the right paths
    expect(mockDeleteFiles).toHaveBeenCalledWith([media.bucketPath]);
  });
});
