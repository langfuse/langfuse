import {
  deleteObservationsByTraceIds,
  deleteScoresByTraceIds,
  deleteTraces,
  logger,
  traceException,
} from "@langfuse/shared/src/server";

export const processClickhouseTraceDelete = async (
  projectId: string,
  traceIds: string[],
) => {
  try {
    await Promise.all([
      deleteTraces(projectId, traceIds),
      deleteObservationsByTraceIds(projectId, traceIds),
      deleteScoresByTraceIds(projectId, traceIds),
    ]);
  } catch (e) {
    logger.error(
      `Error deleting trace ${JSON.stringify(traceIds)} in project ${projectId} from Clickhouse`,
      e,
    );
    traceException(e);
    throw e;
  }
};
