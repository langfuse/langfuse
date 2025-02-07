import { logger, traceException } from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";

export const processAddToQueue = async (
  projectId: string,
  traceIds: string[],
  targetId: string,
) => {
  logger.info(
    `Adding traces ${JSON.stringify(traceIds)} to annotation queue ${targetId} in project ${projectId}`,
  );
  try {
    // cannot use prisma `createMany` operation as we do not have unique constraint enforced on schema level
    // conflict must be handled on query level by reading existing items and filtering out traces that already exist

    // First get existing items
    const existingItems = await prisma.annotationQueueItem.findMany({
      where: {
        projectId,
        queueId: targetId,
        objectId: { in: traceIds },
        objectType: "TRACE",
      },
      select: { objectId: true },
    });

    // Filter out traces that already exist
    const existingTraceIds = new Set(
      existingItems.map((item) => item.objectId),
    );
    const newTraceIds = traceIds.filter((id) => !existingTraceIds.has(id));

    if (newTraceIds.length > 0) {
      await prisma.annotationQueueItem.createMany({
        data: newTraceIds.map((traceId) => ({
          projectId,
          queueId: targetId,
          objectId: traceId,
          objectType: "TRACE",
        })),
      });
    }
  } catch (e) {
    logger.error(
      `Error adding traces ${JSON.stringify(traceIds)} to annotation queue ${targetId} in project ${projectId}`,
      e,
    );
    traceException(e);
    throw e;
  }
};
