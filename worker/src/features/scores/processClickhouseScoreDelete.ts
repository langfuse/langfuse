import {
  deleteScores,
  logger,
  traceException,
  removeIngestionEventsFromS3AndDeleteClikhouseRefs,
} from "@langfuse/shared/src/server";

export const processClickhouseScoreDelete = async (
  projectId: string,
  scoreIds: string[],
) => {
  logger.info(
    `Deleting scores ${JSON.stringify(scoreIds)} in project ${projectId} from Clickhouse`,
  );

  await removeIngestionEventsFromS3AndDeleteClikhouseRefs({
    projectId,
    entityIdProps: { type: "score" as const, ids: scoreIds },
    cutoffDate: undefined,
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
