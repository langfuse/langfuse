import {
  deleteScores,
  logger,
  QueueName,
  traceException,
  deleteIngestionEventsFromS3AndClickhouseForScores,
  type ClickHouseQueryContextTags,
} from "@langfuse/shared/src/server";
import { env } from "../../env";

export const processClickhouseScoreDelete = async (
  projectId: string,
  scoreIds: string[],
  clickHouseQueryTags: ClickHouseQueryContextTags = {
    surface: "worker",
    route: QueueName.ScoreDelete,
  },
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
            clickHouseQueryTags,
          })
        : Promise.resolve(),
      deleteScores(projectId, scoreIds, clickHouseQueryTags),
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
