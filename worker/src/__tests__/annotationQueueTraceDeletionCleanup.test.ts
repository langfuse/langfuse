import { expect, describe, it } from "vitest";
import { randomUUID } from "crypto";
import { Job } from "bullmq";
import {
  createTrace,
  createTracesCh,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";
import { AnnotationQueueObjectType, prisma } from "@langfuse/shared/src/db";
import { processPostgresTraceDelete } from "../features/traces/processPostgresTraceDelete";
import { handleDataRetentionProcessingJob } from "../ee/dataRetention/handleDataRetentionProcessingJob";
import { BatchDataRetentionCleaner } from "../features/batch-data-retention-cleaner";

/**
 * Regression coverage for langfuse/langfuse#12852.
 *
 * Annotation queue items reference traces via `objectId` with no foreign key to
 * ClickHouse. Deleting the referenced trace (manually or via data retention) used
 * to leave the queue item behind, so opening it in the UI failed with
 * "Trace not found". These tests assert the items are cleaned up with the trace
 * across every trace-deletion path: manual/batch deletion, the per-project
 * retention job, and the batch retention cleaner.
 */
describe("annotation queue cleanup on trace deletion (#12852)", () => {
  const createQueueWithItem = async (
    projectId: string,
    objectId: string,
    objectType: AnnotationQueueObjectType = AnnotationQueueObjectType.TRACE,
  ) => {
    const queueId = randomUUID();
    await prisma.annotationQueue.create({
      data: { id: queueId, projectId, name: `queue-${queueId}` },
    });
    const item = await prisma.annotationQueueItem.create({
      data: { projectId, queueId, objectId, objectType },
    });
    return item.id;
  };

  const itemExists = async (id: string) =>
    (await prisma.annotationQueueItem.findUnique({ where: { id } })) !== null;

  describe("manual / batch trace deletion", () => {
    it("deletes annotation queue items referencing the deleted traces", async () => {
      const { projectId } = await createOrgProjectAndApiKey();

      const deletedTraceId = randomUUID();
      const keptTraceId = randomUUID();
      const deletedItemId = await createQueueWithItem(projectId, deletedTraceId);
      const keptItemId = await createQueueWithItem(projectId, keptTraceId);

      // When: only the first trace is deleted
      await processPostgresTraceDelete(projectId, [deletedTraceId]);

      // Then: the item for the deleted trace is gone, the other item remains
      expect(await itemExists(deletedItemId)).toBe(false);
      expect(await itemExists(keptItemId)).toBe(true);
    });

    it("removes every queue item referencing the same deleted trace", async () => {
      const { projectId } = await createOrgProjectAndApiKey();

      const traceId = randomUUID();
      // Same trace queued in two different queues -> two items, one objectId.
      const itemA = await createQueueWithItem(projectId, traceId);
      const itemB = await createQueueWithItem(projectId, traceId);

      await processPostgresTraceDelete(projectId, [traceId]);

      expect(await itemExists(itemA)).toBe(false);
      expect(await itemExists(itemB)).toBe(false);
    });

    it("deletes only the referenced project's items, not another project's", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const { projectId: otherProjectId } = await createOrgProjectAndApiKey();

      const sharedTraceId = randomUUID();
      const sameProjectItemId = await createQueueWithItem(
        projectId,
        sharedTraceId,
      );
      const otherProjectItemId = await createQueueWithItem(
        otherProjectId,
        sharedTraceId,
      );

      await processPostgresTraceDelete(projectId, [sharedTraceId]);

      // The item in the deleted trace's project is removed...
      expect(await itemExists(sameProjectItemId)).toBe(false);
      // ...while an item with the same objectId in another project is untouched.
      expect(await itemExists(otherProjectItemId)).toBe(true);
    });

    it("leaves OBSERVATION-type items untouched (cleanup is scoped to TRACE)", async () => {
      // Documents the intentional scope: trace cleanup only removes TRACE-type
      // items. OBSERVATION-type orphan handling is a separate follow-up.
      const { projectId } = await createOrgProjectAndApiKey();

      const traceId = randomUUID();
      const observationItemId = await createQueueWithItem(
        projectId,
        traceId,
        AnnotationQueueObjectType.OBSERVATION,
      );

      await processPostgresTraceDelete(projectId, [traceId]);

      expect(await itemExists(observationItemId)).toBe(true);
    });
  });

  describe("per-project data retention job", () => {
    it("deletes items whose trace is expired, keeping recent ones", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      await prisma.project.update({
        where: { id: projectId },
        data: { retentionDays: 7 },
      });

      const oldTraceId = randomUUID();
      const recentTraceId = randomUUID();
      await createTracesCh([
        createTrace({
          id: oldTraceId,
          project_id: projectId,
          timestamp: Date.now() - 1000 * 60 * 60 * 24 * 30, // 30d ago -> expired
        }),
        createTrace({
          id: recentTraceId,
          project_id: projectId,
          timestamp: Date.now(), // within retention -> kept
        }),
      ]);

      const oldItemId = await createQueueWithItem(projectId, oldTraceId);
      const recentItemId = await createQueueWithItem(projectId, recentTraceId);

      await handleDataRetentionProcessingJob({
        data: { payload: { projectId, retention: 7 } },
      } as Job);

      expect(await itemExists(oldItemId)).toBe(false);
      expect(await itemExists(recentItemId)).toBe(true);

      await prisma.project.update({
        where: { id: projectId },
        data: { retentionDays: null },
      });
    });
  });

  describe("batch data retention cleaner", () => {
    it("deletes items whose trace is removed by the batch cleaner", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      await prisma.project.update({
        where: { id: projectId },
        data: { retentionDays: 7 },
      });

      const oldTraceId = randomUUID();
      const recentTraceId = randomUUID();
      await createTracesCh([
        createTrace({
          id: oldTraceId,
          project_id: projectId,
          timestamp: Date.now() - 1000 * 60 * 60 * 24 * 30, // 30d ago -> expired
        }),
        createTrace({
          id: recentTraceId,
          project_id: projectId,
          timestamp: Date.now(), // within retention -> kept
        }),
      ]);

      const oldItemId = await createQueueWithItem(projectId, oldTraceId);
      const recentItemId = await createQueueWithItem(projectId, recentTraceId);

      await new BatchDataRetentionCleaner("traces").processBatch();

      expect(await itemExists(oldItemId)).toBe(false);
      expect(await itemExists(recentItemId)).toBe(true);

      await prisma.project.update({
        where: { id: projectId },
        data: { retentionDays: null },
      });
    });
  });
});
