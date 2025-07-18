import {
  deleteScores,
  logger,
  traceException,
  deleteIngestionEventsFromS3AndClickhouseForScores,
  // Add Doris imports
  isDorisBackend,
} from "@langfuse/shared/src/server";

export const processClickhouseScoreDelete = async (
  projectId: string,
  scoreIds: string[],
) => {
  const backendName = isDorisBackend() ? "Doris" : "Clickhouse";
  logger.info(
    `Deleting scores ${JSON.stringify(scoreIds)} in project ${projectId} from ${backendName}`,
  );

  await deleteIngestionEventsFromS3AndClickhouseForScores({
    projectId,
    scoreIds,
  });

  try {
    await deleteScores(projectId, scoreIds);
  } catch (e) {
    logger.error(
      `Error deleting scores ${JSON.stringify(scoreIds)} in project ${projectId} from ${backendName}`,
      e,
    );
    traceException(e);
    throw e;
  }
};
