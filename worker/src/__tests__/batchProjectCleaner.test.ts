import { expect, describe, it, afterEach } from "vitest";
import { randomUUID } from "crypto";
import {
  BatchProjectCleaner,
  BATCH_DELETION_TABLES,
  BATCH_PROJECT_CLEANER_LOCK_PREFIX,
} from "../features/batch-project-cleaner";
import {
  createOrgProjectAndApiKey,
  createTracesCh,
  createTrace,
  createDatasetRunItemsCh,
  createDatasetRunItem,
  queryClickhouse,
  redis,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { env } from "../env";

async function getClickhouseCount(
  table: string,
  projectId: string,
): Promise<number> {
  const result = await queryClickhouse<{ count: number }>({
    query: `SELECT count() as count FROM ${table} FINAL WHERE project_id = {projectId: String}`,
    params: { projectId },
  });
  return Number(result[0]?.count ?? 0);
}

describe("BatchProjectCleaner", () => {
  const TEST_TABLE = "traces" as const;
  const TEST_LOCK_KEY = `${BATCH_PROJECT_CLEANER_LOCK_PREFIX}:${TEST_TABLE}`;

  // Clean up Redis locks after each test
  afterEach(async () => {
    for (const table of BATCH_DELETION_TABLES) {
      await redis?.del(`${BATCH_PROJECT_CLEANER_LOCK_PREFIX}:${table}`);
    }
  });

  describe("processBatch", () => {
    it("should return sleep interval when no deleted projects exist", async () => {
      // Clean up any soft-deleted projects from other tests
      await prisma.project.updateMany({
        where: { deletedAt: { not: null } },
        data: { deletedAt: null },
      });

      // Create an active project (not deleted)
      await createOrgProjectAndApiKey();

      const cleaner = new BatchProjectCleaner(TEST_TABLE);
      const nextDelayMs = await cleaner.processBatch();

      expect(nextDelayMs).toBe(
        env.LANGFUSE_BATCH_PROJECT_CLEANER_SLEEP_ON_EMPTY_MS,
      );

      // Verify lock was not taken
      const lockValue = await redis?.get(TEST_LOCK_KEY);
      expect(lockValue).toBeNull();
    });

    it("should return sleep interval when deleted project has no ClickHouse data", async () => {
      // Create and soft-delete a project
      const { projectId } = await createOrgProjectAndApiKey();
      await prisma.project.update({
        where: { id: projectId },
        data: { deletedAt: new Date() },
      });

      const cleaner = new BatchProjectCleaner(TEST_TABLE);
      const nextDelayMs = await cleaner.processBatch();

      expect(nextDelayMs).toBe(
        env.LANGFUSE_BATCH_PROJECT_CLEANER_SLEEP_ON_EMPTY_MS,
      );

      // Verify lock was not taken
      const lockValue = await redis?.get(TEST_LOCK_KEY);
      expect(lockValue).toBeNull();
    });

    it("should delete traces for soft-deleted project", async () => {
      // Create and soft-delete a project
      const { projectId } = await createOrgProjectAndApiKey();
      await prisma.project.update({
        where: { id: projectId },
        data: { deletedAt: new Date() },
      });

      // Insert test traces into ClickHouse
      await createTracesCh([
        createTrace({ id: randomUUID(), project_id: projectId }),
        createTrace({ id: randomUUID(), project_id: projectId }),
      ]);

      // Verify traces exist before deletion
      const countBefore = await getClickhouseCount(TEST_TABLE, projectId);
      expect(countBefore).toBe(2);

      // Run processBatch
      const cleaner = new BatchProjectCleaner(TEST_TABLE);
      const nextDelayMs = await cleaner.processBatch();

      // Verify traces were deleted
      const countAfter = await getClickhouseCount(TEST_TABLE, projectId);
      expect(countAfter).toBe(0);

      // Verify returned check interval (work was done)
      expect(nextDelayMs).toBe(
        env.LANGFUSE_BATCH_PROJECT_CLEANER_CHECK_INTERVAL_MS,
      );
    });

    it("should not affect traces from active projects", async () => {
      // Create two projects
      const { projectId: deletedProjectId } = await createOrgProjectAndApiKey();
      const { projectId: activeProjectId } = await createOrgProjectAndApiKey();

      // Soft-delete only one project
      await prisma.project.update({
        where: { id: deletedProjectId },
        data: { deletedAt: new Date() },
      });

      // Insert traces for both projects
      await createTracesCh([
        createTrace({ id: randomUUID(), project_id: deletedProjectId }),
        createTrace({ id: randomUUID(), project_id: deletedProjectId }),
        createTrace({ id: randomUUID(), project_id: activeProjectId }),
        createTrace({ id: randomUUID(), project_id: activeProjectId }),
        createTrace({ id: randomUUID(), project_id: activeProjectId }),
      ]);

      // Verify traces exist before deletion
      expect(await getClickhouseCount(TEST_TABLE, deletedProjectId)).toBe(2);
      expect(await getClickhouseCount(TEST_TABLE, activeProjectId)).toBe(3);

      // Run processBatch
      const cleaner = new BatchProjectCleaner(TEST_TABLE);
      await cleaner.processBatch();

      // Verify only deleted project's traces were removed
      expect(await getClickhouseCount(TEST_TABLE, deletedProjectId)).toBe(0);
      expect(await getClickhouseCount(TEST_TABLE, activeProjectId)).toBe(3);
    });

    it("should delete traces from multiple soft-deleted projects", async () => {
      // Create and soft-delete two projects
      const { projectId: projectId1 } = await createOrgProjectAndApiKey();
      const { projectId: projectId2 } = await createOrgProjectAndApiKey();

      await prisma.project.update({
        where: { id: projectId1 },
        data: { deletedAt: new Date() },
      });
      await prisma.project.update({
        where: { id: projectId2 },
        data: { deletedAt: new Date() },
      });

      // Insert traces for both projects
      await createTracesCh([
        createTrace({ id: randomUUID(), project_id: projectId1 }),
        createTrace({ id: randomUUID(), project_id: projectId2 }),
        createTrace({ id: randomUUID(), project_id: projectId2 }),
      ]);

      // Run processBatch
      const cleaner = new BatchProjectCleaner(TEST_TABLE);
      const nextDelayMs = await cleaner.processBatch();

      // Verify both projects' traces were deleted
      expect(await getClickhouseCount(TEST_TABLE, projectId1)).toBe(0);
      expect(await getClickhouseCount(TEST_TABLE, projectId2)).toBe(0);
      expect(nextDelayMs).toBe(
        env.LANGFUSE_BATCH_PROJECT_CLEANER_CHECK_INTERVAL_MS,
      );
    });

    it("should skip processing when lock is already held", async () => {
      // Create and soft-delete a project
      const { projectId } = await createOrgProjectAndApiKey();
      await prisma.project.update({
        where: { id: projectId },
        data: { deletedAt: new Date() },
      });

      // Insert traces
      await createTracesCh([
        createTrace({ id: randomUUID(), project_id: projectId }),
      ]);

      // Acquire the lock manually
      await redis?.set(TEST_LOCK_KEY, "locked", "EX", 3600, "NX");

      // Run processBatch - should skip because lock is held
      const cleaner = new BatchProjectCleaner(TEST_TABLE);
      const nextDelayMs = await cleaner.processBatch();

      // Verify traces were NOT deleted (lock blocked processing)
      expect(await getClickhouseCount(TEST_TABLE, projectId)).toBe(1);
      expect(nextDelayMs).toBe(
        env.LANGFUSE_BATCH_PROJECT_CLEANER_SLEEP_ON_EMPTY_MS,
      );
    });

    it("should release lock after processing completes", async () => {
      // Create and soft-delete a project
      const { projectId } = await createOrgProjectAndApiKey();
      await prisma.project.update({
        where: { id: projectId },
        data: { deletedAt: new Date() },
      });

      // Insert traces
      await createTracesCh([
        createTrace({ id: randomUUID(), project_id: projectId }),
      ]);

      // Run processBatch
      const cleaner = new BatchProjectCleaner(TEST_TABLE);
      await cleaner.processBatch();

      // Verify that traces were deleted, therefore processing occurred
      expect(await getClickhouseCount(TEST_TABLE, projectId)).toBe(0);

      // Verify lock was released
      const lockValue = await redis?.get(TEST_LOCK_KEY);
      expect(lockValue).toBeNull();
    });

    it("should delete dataset_run_items for soft-deleted project", async () => {
      const TABLE = "dataset_run_items_rmt" as const;

      // Create two projects
      const { projectId: deletedProjectId } = await createOrgProjectAndApiKey();
      const { projectId: activeProjectId } = await createOrgProjectAndApiKey();

      // Soft-delete only one project
      await prisma.project.update({
        where: { id: deletedProjectId },
        data: { deletedAt: new Date() },
      });

      // Insert dataset run items for both projects
      await createDatasetRunItemsCh([
        createDatasetRunItem({
          id: randomUUID(),
          project_id: deletedProjectId,
        }),
        createDatasetRunItem({
          id: randomUUID(),
          project_id: deletedProjectId,
        }),
        createDatasetRunItem({
          id: randomUUID(),
          project_id: activeProjectId,
        }),
        createDatasetRunItem({
          id: randomUUID(),
          project_id: activeProjectId,
        }),
        createDatasetRunItem({
          id: randomUUID(),
          project_id: activeProjectId,
        }),
      ]);

      // Verify items exist before deletion
      expect(await getClickhouseCount(TABLE, deletedProjectId)).toBe(2);
      expect(await getClickhouseCount(TABLE, activeProjectId)).toBe(3);

      // Run processBatch
      const cleaner = new BatchProjectCleaner(TABLE);
      await cleaner.processBatch();

      // Verify only deleted project's items were removed
      expect(await getClickhouseCount(TABLE, deletedProjectId)).toBe(0);
      expect(await getClickhouseCount(TABLE, activeProjectId)).toBe(3);
    });
  });
});
