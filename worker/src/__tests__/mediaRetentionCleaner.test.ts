import { expect, describe, it, vi, beforeEach, afterEach } from "vitest";
import { randomUUID } from "crypto";
import {
  createOrgProjectAndApiKey,
  getS3MediaStorageClient,
  removeIngestionEventsFromS3AndDeleteClickhouseRefsForProject,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { MediaRetentionCleaner } from "../features/media-retention-cleaner";

// Mock S3 and blob storage functions
vi.mock("@langfuse/shared/src/server", async () => {
  const actual = await vi.importActual("@langfuse/shared/src/server");
  return {
    ...actual,
    getS3MediaStorageClient: vi.fn(),
    removeIngestionEventsFromS3AndDeleteClickhouseRefsForProject: vi.fn(),
  };
});

// Mock the env module to enable S3 bucket
vi.mock("../../env", async () => {
  const actual = await vi.importActual("../../env");
  return {
    env: {
      ...(actual as { env: object }).env,
      LANGFUSE_S3_MEDIA_UPLOAD_BUCKET: "test-bucket",
      LANGFUSE_ENABLE_BLOB_STORAGE_FILE_LOG: "false",
    },
  };
});

const mockDeleteFiles = vi.fn().mockResolvedValue(undefined);
const mockS3Client = { deleteFiles: mockDeleteFiles };

async function createTestMedia(
  projectId: string,
  createdAt: Date,
  id?: string,
): Promise<{ id: string; bucketPath: string }> {
  const mediaId = id ?? randomUUID();
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
      createdAt,
    },
  });

  return { id: mediaId, bucketPath };
}

async function getMediaCount(projectId: string): Promise<number> {
  return prisma.media.count({
    where: { projectId },
  });
}

/**
 * Helper to run processBatch until no more work exists for a specific project.
 * This handles test isolation when other projects might have expired media.
 */
async function processUntilProjectComplete(
  projectId: string,
  maxIterations = 10,
): Promise<void> {
  for (let i = 0; i < maxIterations; i++) {
    const cleaner = new MediaRetentionCleaner();
    await cleaner.processBatch();
    const count = await getMediaCount(projectId);
    if (count === 0) return;
  }
}

/**
 * Helper to drain any expired media from other test projects
 * before running a test that expects specific behavior.
 */
async function drainExpiredMedia(maxIterations = 20): Promise<void> {
  for (let i = 0; i < maxIterations; i++) {
    const countBefore = mockDeleteFiles.mock.calls.length;
    const cleaner = new MediaRetentionCleaner();
    await cleaner.processBatch();
    const countAfter = mockDeleteFiles.mock.calls.length;
    // No new deletions means no more work
    if (countAfter === countBefore) return;
  }
}

describe("MediaRetentionCleaner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getS3MediaStorageClient).mockReturnValue(mockS3Client as never);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("processBatch", () => {
    it("should delete media files older than project retention", async () => {
      const now = Date.now();
      const tenDaysAgo = new Date(now - 10 * 24 * 60 * 60 * 1000);

      // Create project with 7-day retention
      const { projectId } = await createOrgProjectAndApiKey();
      await prisma.project.update({
        where: { id: projectId },
        data: { retentionDays: 7 },
      });

      // Insert media older than retention (10 days old)
      const media = await createTestMedia(projectId, tenDaysAgo);

      // Verify media exists before deletion
      expect(await getMediaCount(projectId)).toBe(1);

      // Run until our project's media is deleted
      await processUntilProjectComplete(projectId);

      // Verify media was deleted from PostgreSQL
      expect(await getMediaCount(projectId)).toBe(0);

      // Verify our media was deleted from S3
      const allDeletedPaths = mockDeleteFiles.mock.calls.flatMap(
        (call) => call[0] as string[],
      );
      expect(allDeletedPaths).toContain(media.bucketPath);
    });

    it("should NOT delete media within retention period", async () => {
      const now = Date.now();
      const fiveDaysAgo = new Date(now - 5 * 24 * 60 * 60 * 1000);

      // Drain any expired media from other tests first
      await drainExpiredMedia();
      const callsBeforeTest = mockDeleteFiles.mock.calls.length;

      // Create project with 7-day retention
      const { projectId } = await createOrgProjectAndApiKey();
      await prisma.project.update({
        where: { id: projectId },
        data: { retentionDays: 7 },
      });

      // Insert media within retention (5 days old)
      await createTestMedia(projectId, fiveDaysAgo);

      // Verify media exists before deletion
      expect(await getMediaCount(projectId)).toBe(1);

      // Run processBatch - should find no work for this project
      const cleaner = new MediaRetentionCleaner();
      await cleaner.processBatch();

      // Verify media was NOT deleted (5 days < 7 days retention)
      expect(await getMediaCount(projectId)).toBe(1);
    });

    it("should handle projects with different retention times independently", async () => {
      const now = Date.now();
      const tenDaysAgo = new Date(now - 10 * 24 * 60 * 60 * 1000);

      // Project A: 7-day retention (10-day-old data should be deleted)
      const { projectId: projectA } = await createOrgProjectAndApiKey();
      await prisma.project.update({
        where: { id: projectA },
        data: { retentionDays: 7 },
      });
      const mediaA = await createTestMedia(projectA, tenDaysAgo);

      // Project B: 30-day retention (10-day-old data should be kept)
      const { projectId: projectB } = await createOrgProjectAndApiKey();
      await prisma.project.update({
        where: { id: projectB },
        data: { retentionDays: 30 },
      });
      await createTestMedia(projectB, tenDaysAgo);

      // Verify both have media before deletion
      expect(await getMediaCount(projectA)).toBe(1);
      expect(await getMediaCount(projectB)).toBe(1);

      // Run until projectA is processed (it has expired media)
      await processUntilProjectComplete(projectA);

      // Project A's media should be deleted (10 days > 7 days retention)
      expect(await getMediaCount(projectA)).toBe(0);

      // Project B's media should remain (10 days < 30 days retention)
      expect(await getMediaCount(projectB)).toBe(1);

      // Verify project A's media was deleted from S3
      const allDeletedPaths = mockDeleteFiles.mock.calls.flatMap(
        (call) => call[0] as string[],
      );
      expect(allDeletedPaths).toContain(mediaA.bucketPath);
    });

    it("should not affect projects with retention disabled (null)", async () => {
      // Drain any expired media from other tests first
      await drainExpiredMedia();

      const now = Date.now();
      const tenDaysAgo = new Date(now - 10 * 24 * 60 * 60 * 1000);

      // Create project without retention (null)
      const { projectId } = await createOrgProjectAndApiKey();
      // retentionDays is null by default

      // Insert media older than typical retention
      const media = await createTestMedia(projectId, tenDaysAgo);

      // Verify media exists before deletion
      expect(await getMediaCount(projectId)).toBe(1);

      // Run processBatch
      const cleaner = new MediaRetentionCleaner();
      await cleaner.processBatch();

      // Verify media was NOT deleted (no retention policy)
      expect(await getMediaCount(projectId)).toBe(1);
    });

    it("should not affect projects with retention set to 0", async () => {
      // Drain any expired media from other tests first
      await drainExpiredMedia();

      const now = Date.now();
      const tenDaysAgo = new Date(now - 10 * 24 * 60 * 60 * 1000);

      // Create project with retentionDays = 0 (disabled)
      const { projectId } = await createOrgProjectAndApiKey();
      await prisma.project.update({
        where: { id: projectId },
        data: { retentionDays: 0 },
      });

      // Insert media older than typical retention
      await createTestMedia(projectId, tenDaysAgo);

      // Verify media exists before deletion
      expect(await getMediaCount(projectId)).toBe(1);

      // Run processBatch
      const cleaner = new MediaRetentionCleaner();
      await cleaner.processBatch();

      // Verify media was NOT deleted (retention disabled)
      expect(await getMediaCount(projectId)).toBe(1);
    });

    it("should delete old media but keep new media", async () => {
      const now = Date.now();
      const tenDaysAgo = new Date(now - 10 * 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000);

      // Create project with 7-day retention
      const { projectId } = await createOrgProjectAndApiKey();
      await prisma.project.update({
        where: { id: projectId },
        data: { retentionDays: 7 },
      });

      // Insert mix of old and new media
      const oldMedia = await createTestMedia(projectId, tenDaysAgo);
      await createTestMedia(projectId, twoDaysAgo);

      // Verify both media exist before deletion
      expect(await getMediaCount(projectId)).toBe(2);

      // Run until project is processed
      await processUntilProjectComplete(projectId, 20);
      // Note: Project won't reach count=0 since new media remains
      // Let's just run once and check the result
      const cleaner = new MediaRetentionCleaner();
      await cleaner.processBatch();

      // Verify only old media was deleted (count should be 1)
      expect(await getMediaCount(projectId)).toBe(1);
    });

    it("should not affect soft-deleted projects", async () => {
      // Drain any expired media from other tests first
      await drainExpiredMedia();

      const now = Date.now();
      const tenDaysAgo = new Date(now - 10 * 24 * 60 * 60 * 1000);

      // Create soft-deleted project with retention
      const { projectId } = await createOrgProjectAndApiKey();
      await prisma.project.update({
        where: { id: projectId },
        data: {
          retentionDays: 7,
          deletedAt: new Date(),
        },
      });

      // Insert media
      await createTestMedia(projectId, tenDaysAgo);

      // Run processBatch
      const cleaner = new MediaRetentionCleaner();
      await cleaner.processBatch();

      // Verify media was NOT deleted (project is soft-deleted, handled by BatchProjectCleaner)
      expect(await getMediaCount(projectId)).toBe(1);
    });

    it("should delete from S3 before PostgreSQL", async () => {
      const now = Date.now();
      const tenDaysAgo = new Date(now - 10 * 24 * 60 * 60 * 1000);

      // Create project with retention
      const { projectId } = await createOrgProjectAndApiKey();
      await prisma.project.update({
        where: { id: projectId },
        data: { retentionDays: 7 },
      });

      // Insert media
      await createTestMedia(projectId, tenDaysAgo);

      // Track order of operations by checking S3 call happens before media is deleted
      let s3CalledWhileMediaExists = false;

      mockDeleteFiles.mockImplementation(async (paths: string[]) => {
        // Check if the paths belong to our test project
        if (paths[0]?.includes(projectId)) {
          // Check if media still exists in DB when S3 delete is called
          const count = await prisma.media.count({ where: { projectId } });
          if (count > 0) {
            s3CalledWhileMediaExists = true;
          }
        }
      });

      // Run until our project is processed
      await processUntilProjectComplete(projectId);

      // Verify S3 was called while media still existed
      expect(s3CalledWhileMediaExists).toBe(true);
      // Verify media is now deleted
      expect(await getMediaCount(projectId)).toBe(0);
    });

    it("should handle empty result when no expired media exists", async () => {
      // Drain any expired media from other tests first
      await drainExpiredMedia();

      const now = Date.now();
      const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000);

      // Create project with 7-day retention
      const { projectId } = await createOrgProjectAndApiKey();
      await prisma.project.update({
        where: { id: projectId },
        data: { retentionDays: 7 },
      });

      // Insert only recent media (within retention)
      await createTestMedia(projectId, twoDaysAgo);

      // Run processBatch - should complete without error
      const cleaner = new MediaRetentionCleaner();
      await cleaner.processBatch();

      // Verify nothing was deleted
      expect(await getMediaCount(projectId)).toBe(1);
    });
  });

  describe("work-based prioritization", () => {
    it("should process project with oldest expired item first", async () => {
      const now = Date.now();
      const fifteenDaysAgo = new Date(now - 15 * 24 * 60 * 60 * 1000);
      const tenDaysAgo = new Date(now - 10 * 24 * 60 * 60 * 1000);

      // Create two projects, both with 7-day retention
      const { projectId: projectOlder } = await createOrgProjectAndApiKey();
      const { projectId: projectNewer } = await createOrgProjectAndApiKey();

      await prisma.project.update({
        where: { id: projectOlder },
        data: { retentionDays: 7 },
      });
      await prisma.project.update({
        where: { id: projectNewer },
        data: { retentionDays: 7 },
      });

      // Project with older item: 1 media from 15 days ago
      await createTestMedia(projectOlder, fifteenDaysAgo);

      // Project with newer items: 3 media from 10 days ago (more items but newer)
      await createTestMedia(projectNewer, tenDaysAgo);
      await createTestMedia(projectNewer, tenDaysAgo);
      await createTestMedia(projectNewer, tenDaysAgo);

      // Track which projects are processed
      const processedProjects: string[] = [];
      mockDeleteFiles.mockImplementation(async (paths: string[]) => {
        const projectIdMatch = paths[0]?.match(/projects\/([^/]+)\//);
        if (projectIdMatch) {
          const pid = projectIdMatch[1];
          if (!processedProjects.includes(pid)) {
            processedProjects.push(pid);
          }
        }
      });

      // Run first processBatch - should process projectOlder (oldest item) OR any other pending project
      const cleaner = new MediaRetentionCleaner();
      await cleaner.processBatch();

      // Keep running until both our projects are processed
      while (
        !processedProjects.includes(projectOlder) ||
        !processedProjects.includes(projectNewer)
      ) {
        const cleaner = new MediaRetentionCleaner();
        await cleaner.processBatch();
        if (processedProjects.length > 10) break; // Safety limit
      }

      // Verify projectOlder was processed before projectNewer
      // (it has the oldest expired item so should have higher priority)
      const olderIndex = processedProjects.indexOf(projectOlder);
      const newerIndex = processedProjects.indexOf(projectNewer);
      expect(olderIndex).toBeLessThan(newerIndex);
    });
  });
});
