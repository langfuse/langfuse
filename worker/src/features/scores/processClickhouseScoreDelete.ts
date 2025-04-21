import {
  deleteScores,
  logger,
  traceException,
  deleteIngestionEventsFromS3AndClickhouseForScores,
} from "@langfuse/shared/src/server";

export const processClickhouseScoreDelete = async (
  projectId: string,
  scoreIds: string[],
) => {
  logger.info(
    `Deleting scores ${JSON.stringify(scoreIds)} in project ${projectId} from Clickhouse`,
  );

  await deleteIngestionEventsFromS3AndClickhouseForScores({
    projectId,
    scoreIds,
  });

  try {
    await deleteScores(projectId, scoreIds);
  } catch (e) {
    logger.error(
      `Error deleting scores ${JSON.stringify(scoreIds)} in project ${projectId} from Clickhouse`,
      e,
    );
    traceException(e);
    throw e;
  }
};
