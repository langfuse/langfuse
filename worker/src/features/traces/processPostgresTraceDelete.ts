import { AnnotationQueueObjectType, prisma } from "@langfuse/shared/src/db";
import {
  deleteAnnotationQueueItemsByObjectIds,
  logger,
  traceException,
} from "@langfuse/shared/src/server";

export const processPostgresTraceDelete = async (
  projectId: string,
  traceIds: string[],
) => {
  logger.info(
    `Deleting traces ${JSON.stringify(traceIds)} in project ${projectId} from Postgres`,
  );
  try {
    await prisma.jobExecution.deleteMany({
      where: {
        jobInputTraceId: {
          in: traceIds,
        },
        projectId: projectId,
      },
    });

    // Annotation queue items reference traces by objectId with no foreign key to
    // ClickHouse, so deleting the trace would otherwise leave orphaned items that
    // render "Trace not found" in the review UI. See langfuse/langfuse#12852.
    const deletedQueueItems = await deleteAnnotationQueueItemsByObjectIds({
      projectId,
      objectType: AnnotationQueueObjectType.TRACE,
      objectIds: traceIds,
    });
    if (deletedQueueItems > 0) {
      logger.info(
        `Deleted ${deletedQueueItems} annotation queue items referencing deleted traces in project ${projectId}`,
      );
    }
  } catch (e) {
    logger.error(
      `Error deleting trace ${JSON.stringify(traceIds)} in project ${projectId} from Postgres`,
      e,
    );
    traceException(e);
    throw e;
  }
};
