import { logger, traceException } from "@langfuse/shared/src/server";
import { AnnotationQueueObjectType, prisma } from "@langfuse/shared/src/db";

const addToQueue = async ({
  projectId,
  objectIds,
  objectType,
  targetId,
}: {
  projectId: string;
  objectIds: string[];
  objectType: AnnotationQueueObjectType;
  targetId: string;
}) => {
  // cannot use prisma `createMany` operation as we do not have unique constraint enforced on schema level
  // conflict must be handled on query level by reading existing items and filtering out traces that already exist

  // First get existing items
  const existingItems = await prisma.annotationQueueItem.findMany({
    where: {
      projectId,
      queueId: targetId,
      objectId: { in: objectIds },
      objectType,
    },
    select: { objectId: true },
  });

  // Filter out objects that already exist
  const existingObjectIds = new Set(existingItems.map((item) => item.objectId));
  const newObjectIds = objectIds.filter((id) => !existingObjectIds.has(id));

  if (newObjectIds.length > 0) {
    await prisma.annotationQueueItem.createMany({
      data: newObjectIds.map((objectId) => ({
        projectId,
        queueId: targetId,
        objectId,
        objectType,
      })),
    });
  }
};

export const processAddTracesToQueue = async (
  projectId: string,
  traceIds: string[],
  targetId: string,
) => {
  logger.info(
    `Adding traces ${JSON.stringify(traceIds)} to annotation queue ${targetId} in project ${projectId}`,
  );
  try {
    await addToQueue({
      projectId,
      objectIds: traceIds,
      objectType: AnnotationQueueObjectType.TRACE,
      targetId,
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

export const processAddSessionsToQueue = async (
  projectId: string,
  sessionIds: string[],
  targetId: string,
) => {
  logger.info(
    `Adding sessions ${JSON.stringify(sessionIds)} to annotation queue ${targetId} in project ${projectId}`,
  );

  try {
    await addToQueue({
      projectId,
      objectIds: sessionIds,
      objectType: AnnotationQueueObjectType.SESSION,
      targetId,
    });
  } catch (e) {
    logger.error(
      `Error adding sessions ${JSON.stringify(sessionIds)} to annotation queue ${targetId} in project ${projectId}`,
      e,
    );
    traceException(e);
    throw e;
  }
};

export const processAddObservationsToQueue = async (
  projectId: string,
  observationIds: string[],
  targetId: string,
) => {
  logger.info(
    `Adding observations ${JSON.stringify(observationIds)} to annotation queue ${targetId} in project ${projectId}`,
  );

  try {
    await addToQueue({
      projectId,
      objectIds: observationIds,
      objectType: AnnotationQueueObjectType.OBSERVATION,
      targetId,
    });
  } catch (e) {
    logger.error(
      `Error adding observations ${JSON.stringify(observationIds)} to annotation queue ${targetId} in project ${projectId}`,
      e,
    );
    traceException(e);
    throw e;
  }
};
