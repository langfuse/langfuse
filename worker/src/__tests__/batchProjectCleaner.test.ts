import { expect, describe, it } from "vitest";
import { randomUUID } from "crypto";
import { BatchProjectCleaner } from "../features/batch-project-cleaner";
import {
  createOrgProjectAndApiKey,
  createTracesCh,
  createTrace,
  createDatasetRunItemsCh,
  createDatasetRunItem,
  queryClickhouse,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";

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

  describe("processBatch", () => {
    it("should do nothing when no deleted projects exist", async () => {
      // Create an active project (not deleted)
      await createOrgProjectAndApiKey();

      // Should complete without error
      await BatchProjectCleaner.processBatch(TEST_TABLE);
    });

    it("should do nothing when deleted project has no ClickHouse data", async () => {
      // Create and soft-delete a project
      const { projectId } = await createOrgProjectAndApiKey();
      await prisma.project.update({
        where: { id: projectId },
        data: { deletedAt: new Date() },
      });

      // Should complete without error
      await BatchProjectCleaner.processBatch(TEST_TABLE);
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
      await BatchProjectCleaner.processBatch(TEST_TABLE);

      // Verify traces were deleted
      const countAfter = await getClickhouseCount(TEST_TABLE, projectId);
      expect(countAfter).toBe(0);
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
      await BatchProjectCleaner.processBatch(TEST_TABLE);

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
      await BatchProjectCleaner.processBatch(TEST_TABLE);

      // Verify both projects' traces were deleted
      expect(await getClickhouseCount(TEST_TABLE, projectId1)).toBe(0);
      expect(await getClickhouseCount(TEST_TABLE, projectId2)).toBe(0);
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
      await BatchProjectCleaner.processBatch(TABLE);

      // Verify only deleted project's items were removed
      expect(await getClickhouseCount(TABLE, deletedProjectId)).toBe(0);
      expect(await getClickhouseCount(TABLE, activeProjectId)).toBe(3);
    });
  });
});
