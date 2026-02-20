import { expect, describe, it } from "vitest";
import { randomUUID } from "crypto";
import { BatchDataRetentionCleaner } from "../features/batch-data-retention-cleaner";
import {
  createOrgProjectAndApiKey,
  createTracesCh,
  createTrace,
  createObservationsCh,
  createObservation,
  createScoresCh,
  createTraceScore,
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

describe("BatchDataRetentionCleaner", () => {
  describe("processBatch - traces", () => {
    const TABLE = "traces" as const;

    it("should delete traces older than project retention", async () => {
      const now = Date.now();
      const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;

      // Create project with 7-day retention
      const { projectId } = await createOrgProjectAndApiKey();
      await prisma.project.update({
        where: { id: projectId },
        data: { retentionDays: 7 },
      });

      // Insert trace older than retention (10 days old)
      await createTracesCh([
        createTrace({
          id: randomUUID(),
          project_id: projectId,
          timestamp: tenDaysAgo,
        }),
      ]);

      // Verify trace exists before deletion
      expect(await getClickhouseCount(TABLE, projectId)).toBe(1);

      // Run processBatch
      const cleaner = new BatchDataRetentionCleaner(TABLE);
      await cleaner.processBatch();

      // Verify trace was deleted (10 days > 7 days retention)
      expect(await getClickhouseCount(TABLE, projectId)).toBe(0);
    });

    it("should NOT delete traces within retention period", async () => {
      const now = Date.now();
      const fiveDaysAgo = now - 5 * 24 * 60 * 60 * 1000;

      // Create project with 7-day retention
      const { projectId } = await createOrgProjectAndApiKey();
      await prisma.project.update({
        where: { id: projectId },
        data: { retentionDays: 7 },
      });

      // Insert trace within retention (5 days old)
      await createTracesCh([
        createTrace({
          id: randomUUID(),
          project_id: projectId,
          timestamp: fiveDaysAgo,
        }),
      ]);

      // Verify trace exists before deletion
      expect(await getClickhouseCount(TABLE, projectId)).toBe(1);

      // Run processBatch
      const cleaner = new BatchDataRetentionCleaner(TABLE);
      await cleaner.processBatch();

      // Verify trace was NOT deleted (5 days < 7 days retention)
      expect(await getClickhouseCount(TABLE, projectId)).toBe(1);
    });

    it("should handle projects with different retention times independently", async () => {
      const now = Date.now();
      const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

      // Project A: 7-day retention (10-day-old data should be deleted)
      const { projectId: projectA } = await createOrgProjectAndApiKey();
      await prisma.project.update({
        where: { id: projectA },
        data: { retentionDays: 7 },
      });
      await createTracesCh([
        createTrace({
          id: randomUUID(),
          project_id: projectA,
          timestamp: tenDaysAgo,
        }),
        createTrace({
          id: randomUUID(),
          project_id: projectA,
          timestamp: now,
        }),
      ]);

      // Project B: 30-day retention (10-day-old data should be kept)
      const { projectId: projectB } = await createOrgProjectAndApiKey();
      await prisma.project.update({
        where: { id: projectB },
        data: { retentionDays: 30 },
      });
      await createTracesCh([
        createTrace({
          id: randomUUID(),
          project_id: projectB,
          timestamp: tenDaysAgo,
        }),
        createTrace({
          id: randomUUID(),
          project_id: projectB,
          timestamp: thirtyDaysAgo,
        }),
      ]);

      // Verify both have data before deletion
      expect(await getClickhouseCount(TABLE, projectA)).toBe(2);
      expect(await getClickhouseCount(TABLE, projectB)).toBe(2);

      // Run processBatch
      const cleaner = new BatchDataRetentionCleaner(TABLE);
      await cleaner.processBatch();

      // Only now trace should remain in A
      expect(await getClickhouseCount(TABLE, projectA)).toBe(1);
      // Only tenDaysAgo trace should remain in B
      expect(await getClickhouseCount(TABLE, projectB)).toBe(1);
    });

    it("should not affect projects with retention disabled (null)", async () => {
      const now = Date.now();
      const old = now - 100 * 24 * 60 * 60 * 1000;

      // Create project without retention (null)
      const { projectId } = await createOrgProjectAndApiKey();
      // retentionDays is null by default

      // Insert trace older than typical retention
      await createTracesCh([
        createTrace({
          id: randomUUID(),
          project_id: projectId,
          timestamp: old,
        }),
      ]);

      // Verify trace exists before deletion
      expect(await getClickhouseCount(TABLE, projectId)).toBe(1);

      // Run processBatch
      const cleaner = new BatchDataRetentionCleaner(TABLE);
      await cleaner.processBatch();

      // Verify trace was NOT deleted (no retention policy)
      expect(await getClickhouseCount(TABLE, projectId)).toBe(1);
    });

    it("should not affect projects with retention set to 0", async () => {
      const now = Date.now();
      const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;

      // Create project with retentionDays = 0 (disabled)
      const { projectId } = await createOrgProjectAndApiKey();
      await prisma.project.update({
        where: { id: projectId },
        data: { retentionDays: 0 },
      });

      // Insert trace older than typical retention
      await createTracesCh([
        createTrace({
          id: randomUUID(),
          project_id: projectId,
          timestamp: tenDaysAgo,
        }),
      ]);

      // Verify trace exists before deletion
      expect(await getClickhouseCount(TABLE, projectId)).toBe(1);

      // Run processBatch
      const cleaner = new BatchDataRetentionCleaner(TABLE);
      await cleaner.processBatch();

      // Verify trace was NOT deleted (retention disabled)
      expect(await getClickhouseCount(TABLE, projectId)).toBe(1);
    });

    it("should not affect soft-deleted projects", async () => {
      const now = Date.now();
      const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;

      // Create soft-deleted project with retention
      const { projectId } = await createOrgProjectAndApiKey();
      await prisma.project.update({
        where: { id: projectId },
        data: {
          retentionDays: 7,
          deletedAt: new Date(),
        },
      });

      // Insert trace
      await createTracesCh([
        createTrace({
          id: randomUUID(),
          project_id: projectId,
          timestamp: tenDaysAgo,
        }),
      ]);

      // Run processBatch
      const cleaner = new BatchDataRetentionCleaner(TABLE);
      await cleaner.processBatch();

      // Verify trace was NOT deleted (project is soft-deleted, handled by BatchProjectCleaner)
      expect(await getClickhouseCount(TABLE, projectId)).toBe(1);
    });
  });

  describe("processBatch - observations", () => {
    const TABLE = "observations" as const;

    it("should process observations correctly (uses start_time)", async () => {
      const now = Date.now();
      const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;

      // Create project with 7-day retention
      const { projectId } = await createOrgProjectAndApiKey();
      await prisma.project.update({
        where: { id: projectId },
        data: { retentionDays: 7 },
      });

      // Insert observation with old start_time
      await createObservationsCh([
        createObservation({
          id: randomUUID(),
          project_id: projectId,
          start_time: tenDaysAgo,
        }),
      ]);

      // Verify observation exists before deletion
      expect(await getClickhouseCount(TABLE, projectId)).toBe(1);

      // Run processBatch
      const cleaner = new BatchDataRetentionCleaner(TABLE);
      await cleaner.processBatch();

      // Verify observation was deleted
      expect(await getClickhouseCount(TABLE, projectId)).toBe(0);
    });
  });

  describe("processBatch - scores", () => {
    const TABLE = "scores" as const;

    it("should process scores correctly (uses timestamp)", async () => {
      const now = Date.now();
      const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;

      // Create project with 7-day retention
      const { projectId } = await createOrgProjectAndApiKey();
      await prisma.project.update({
        where: { id: projectId },
        data: { retentionDays: 7 },
      });

      // Insert score with old timestamp
      await createScoresCh([
        createTraceScore({
          id: randomUUID(),
          project_id: projectId,
          timestamp: tenDaysAgo,
        }),
      ]);

      // Verify score exists before deletion
      expect(await getClickhouseCount(TABLE, projectId)).toBe(1);

      // Run processBatch
      const cleaner = new BatchDataRetentionCleaner(TABLE);
      await cleaner.processBatch();

      // Verify score was deleted
      expect(await getClickhouseCount(TABLE, projectId)).toBe(0);
    });
  });
});
