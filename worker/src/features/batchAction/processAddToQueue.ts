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
    await prisma.annotationQueueItem.createMany({
      data: traceIds.map((traceId) => ({
        projectId: projectId,
        queueId: targetId,
        objectId: traceId,
        objectType: "TRACE",
      })),
      skipDuplicates: true,
    });
  } catch (e) {
    logger.error(
      `Error adding traces ${JSON.stringify(traceIds)} to annotation queue ${targetId} in project ${projectId}`,
      e,
    );
    traceException(e);
    throw e;
  }
};
