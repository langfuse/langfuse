import { AnnotationQueueObjectType, prisma } from "../../db";
import { getTraceIdsOlderThan } from "./traces";

/**
 * Delete annotation queue items that reference any of the given objects.
 *
 * Annotation queue items point at traces/observations via `objectId` with no
 * foreign key to the underlying ClickHouse data. When that data is deleted
 * (manual/batch trace deletion or data retention) the queue items would otherwise
 * be left behind as orphans that render "Trace not found" in the review UI.
 * Callers pass the ids that are being removed so the matching items are cleaned up
 * in the same operation. See langfuse/langfuse#12852.
 *
 * @returns the number of deleted annotation queue items.
 */
export const deleteAnnotationQueueItemsByObjectIds = async ({
  projectId,
  objectType,
  objectIds,
}: {
  projectId: string;
  objectType: AnnotationQueueObjectType;
  objectIds: string[];
}): Promise<number> => {
  if (objectIds.length === 0) return 0;

  const { count } = await prisma.annotationQueueItem.deleteMany({
    where: {
      projectId,
      objectType,
      objectId: { in: objectIds },
    },
  });

  return count;
};

/**
 * Resolve which TRACE-type annotation queue items in a project reference traces
 * older than `beforeDate` (i.e. traces about to be removed by data retention).
 *
 * Returns the expiring trace ids, which callers pass to
 * `deleteAnnotationQueueItemsByObjectIds` AFTER the traces are deleted. It is
 * resolved while the traces still exist so we never drop items for traces that
 * survive the cutoff. Annotation queues are a small, curated set, so listing the
 * referenced ids and filtering them by the cutoff stays cheap. Shared by the
 * per-project retention job and the batch retention cleaner. See
 * langfuse/langfuse#12852.
 */
export const getExpiredAnnotationQueueTraceIds = async (
  projectId: string,
  beforeDate: Date,
): Promise<string[]> => {
  const items = await prisma.annotationQueueItem.findMany({
    where: { projectId, objectType: AnnotationQueueObjectType.TRACE },
    select: { objectId: true },
  });

  const referencedTraceIds = [...new Set(items.map((item) => item.objectId))];
  if (referencedTraceIds.length === 0) return [];

  return getTraceIdsOlderThan(projectId, referencedTraceIds, beforeDate);
};
