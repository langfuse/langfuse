import {
  insertAnnotationQueueItems,
  logger,
  traceException,
} from "@langfuse/shared/src/server";
import { AnnotationQueueObjectType } from "@langfuse/shared/src/db";

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
  await insertAnnotationQueueItems({
    projectId,
    queueId: targetId,
    objectType,
    objectIds,
  });
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
