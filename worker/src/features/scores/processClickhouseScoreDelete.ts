import {
  deleteScores,
  logger,
  traceException,
  deleteIngestionEventsFromS3AndClickhouseForScores,
} from "@langfuse/shared/src/server";
import { env } from "../../env";

export const processClickhouseScoreDelete = async (
  projectId: string,
  scoreIds: string[],
) => {
  logger.info(
    `Deleting scores ${JSON.stringify(scoreIds)} in project ${projectId} from Clickhouse and S3`,
  );

  try {
    await Promise.all([
      env.LANGFUSE_ENABLE_BLOB_STORAGE_FILE_LOG === "true"
        ? deleteIngestionEventsFromS3AndClickhouseForScores({
            projectId,
            scoreIds,
          })
        : Promise.resolve(),
      deleteScores(projectId, scoreIds),
    ]);
  } catch (e) {
    logger.error(
      `Error deleting scores ${JSON.stringify(scoreIds)} in project ${projectId} from Clickhouse`,
      e,
    );
    traceException(e);
    throw e;
  }
};
