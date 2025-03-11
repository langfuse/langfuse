import {
  deleteScores,
  deleteEventLogByProjectIdAndIds,
  logger,
  StorageService,
  StorageServiceFactory,
  traceException,
  getEventLogByProjectIdAndEntityIds,
} from "@langfuse/shared/src/server";
import { env } from "../../env";

let s3EventStorageClient: StorageService;

const getS3EventStorageClient = (bucketName: string): StorageService => {
  if (!s3EventStorageClient) {
    s3EventStorageClient = StorageServiceFactory.getInstance({
      bucketName,
      accessKeyId: env.LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID,
      secretAccessKey: env.LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY,
      endpoint: env.LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT,
      region: env.LANGFUSE_S3_EVENT_UPLOAD_REGION,
      forcePathStyle: env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
    });
  }
  return s3EventStorageClient;
};

export const processClickhouseScoreDelete = async (
  projectId: string,
  scoreIds: string[],
) => {
  logger.info(
    `Deleting scores ${JSON.stringify(scoreIds)} in project ${projectId} from Clickhouse`,
  );

  const eventLogStream = getEventLogByProjectIdAndEntityIds(
    projectId,
    "score",
    scoreIds,
  );
  let eventLogRecords: { id: string; path: string }[] = [];
  const eventStorageClient = getS3EventStorageClient(
    env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
  );
  for await (const eventLog of eventLogStream) {
    eventLogRecords.push({ id: eventLog.id, path: eventLog.bucket_path });
    if (eventLogRecords.length > 500) {
      // Delete the current batch and reset the list
      await eventStorageClient.deleteFiles(eventLogRecords.map((r) => r.path));
      await deleteEventLogByProjectIdAndIds(
        projectId,
        eventLogRecords.map((r) => r.id),
      );
      eventLogRecords = [];
    }
  }
  // Delete any remaining files
  await eventStorageClient.deleteFiles(eventLogRecords.map((r) => r.path));
  await deleteEventLogByProjectIdAndIds(
    projectId,
    eventLogRecords.map((r) => r.id),
  );

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
