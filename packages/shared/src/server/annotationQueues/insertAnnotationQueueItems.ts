import { randomUUID } from "crypto";

import {
  AnnotationQueueStatus,
  type AnnotationQueueObjectType,
  Prisma,
  prisma,
} from "../../db";

export type InsertAnnotationQueueItemsParams = {
  projectId: string;
  queueId: string;
  objectType: AnnotationQueueObjectType;
  objectIds: string[];
  status?: AnnotationQueueStatus;
};

export type InsertAnnotationQueueItemsResult = {
  createdItems: Array<{ id: string; objectId: string }>;
  skippedObjectIds: string[];
};

/**
 * Inserts annotation queue items, skipping objects already present under the
 * same [projectId, queueId, objectId, objectType] tuple (regardless of item
 * status). The subquery is covered by the existing (object_id, object_type, project_id, queue_id)
 * index. Two concurrent calls for the same object can still both insert
 * (there is no constraint for Postgres to arbitrate on) - acceptable for
 * this human-triggered action; this is the single place to harden further
 * (e.g. an advisory lock) if that ever matters.
 */
export async function insertAnnotationQueueItems({
  projectId,
  queueId,
  objectType,
  objectIds,
  status = AnnotationQueueStatus.PENDING,
}: InsertAnnotationQueueItemsParams): Promise<InsertAnnotationQueueItemsResult> {
  const uniqueObjectIds = Array.from(new Set(objectIds));
  if (uniqueObjectIds.length === 0) {
    return { createdItems: [], skippedObjectIds: [] };
  }

  const completedAt =
    status === AnnotationQueueStatus.COMPLETED ? new Date() : null;

  const candidateRows = Prisma.join(
    uniqueObjectIds.map(
      (objectId) =>
        Prisma.sql`(${randomUUID()}::text, ${projectId}::text, ${queueId}::text, ${objectId}::text, ${objectType}::"AnnotationQueueObjectType", ${status}::"AnnotationQueueStatus", ${completedAt}::timestamp(3))`,
    ),
  );

  const createdRows = await prisma.$queryRaw<
    Array<{ id: string; object_id: string }>
  >(Prisma.sql`
    INSERT INTO "annotation_queue_items" (
      "id", "project_id", "queue_id", "object_id", "object_type", "status", "completed_at"
    )
    SELECT candidate.id, candidate.project_id, candidate.queue_id, candidate.object_id, candidate.object_type, candidate.status, candidate.completed_at
    FROM (VALUES ${candidateRows}) AS candidate(id, project_id, queue_id, object_id, object_type, status, completed_at)
    WHERE NOT EXISTS (
      SELECT 1 FROM "annotation_queue_items" existing
      WHERE existing."project_id" = candidate.project_id
        AND existing."queue_id" = candidate.queue_id
        AND existing."object_id" = candidate.object_id
        AND existing."object_type" = candidate.object_type
    )
    RETURNING "id", "object_id"
  `);

  const createdObjectIds = new Set(createdRows.map((row) => row.object_id));

  return {
    createdItems: createdRows.map((row) => ({
      id: row.id,
      objectId: row.object_id,
    })),
    skippedObjectIds: uniqueObjectIds.filter(
      (objectId) => !createdObjectIds.has(objectId),
    ),
  };
}
