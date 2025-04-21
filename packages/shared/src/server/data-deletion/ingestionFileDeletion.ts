import {
  EventLogRecordReadType,
  getBlobStorageByProjectId,
  getBlobStorageByProjectIdAndEntityIds,
  getBlobStorageByProjectIdAndTraceIds,
  logger,
} from "..";
import { env } from "../../env";
import { clickhouseClient } from "../clickhouse/client";
import { getS3EventStorageClient } from "../s3";

export const deleteIngestionEventsFromS3AndClickhouseForScores = async (p: {
  projectId: string;
  scoreIds: string[];
}) => {
  const eventLogStream = getBlobStorageByProjectIdAndEntityIds(
    p.projectId,
    "score",
    p.scoreIds,
  );

  return removeIngestionEventsFromS3AndDeleteClikhouseRefs({
    projectId: p.projectId,
    stream: eventLogStream,
  });
};

export const removeIngestionEventsFromS3AndDeleteClickhouseRefsForTraces =
  async (p: { projectId: string; traceIds: string[] }) => {
    const stream = getBlobStorageByProjectIdAndTraceIds(
      p.projectId,
      p.traceIds,
    );

    return removeIngestionEventsFromS3AndDeleteClikhouseRefs({
      projectId: p.projectId,
      stream: stream,
    });
  };

export const removeIngestionEventsFromS3AndDeleteClickhouseRefsForProject = (
  projectId: string,
  cutOffDate: Date | undefined,
) => {
  const stream = getBlobStorageByProjectId(projectId);
  return removeIngestionEventsFromS3AndDeleteClikhouseRefs({
    projectId: projectId,
    stream: stream,
  });
};

async function removeIngestionEventsFromS3AndDeleteClikhouseRefs(p: {
  projectId: string;
  stream: AsyncGenerator<EventLogRecordReadType>;
}) {
  const { projectId, stream } = p;

  let batch = 0;

  let blobStorageRefs = [];
  const eventStorageClient = getS3EventStorageClient(
    env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
  );
  for await (const eventLog of stream) {
    blobStorageRefs.push(eventLog);
    if (blobStorageRefs.length > 500) {
      // Delete the current batch and reset the list
      await eventStorageClient.deleteFiles(
        blobStorageRefs.map((r) => r.bucket_path),
      );

      // soft delete the blob storage references in clickhouse
      await clickhouseClient().insert({
        table: "blob_storage_file_log",
        values: blobStorageRefs.map((e) => ({
          ...e,
          is_deleted: 1,
          event_ts: new Date().getTime(),
          updated_at: new Date().getTime(),
        })),
        format: "JSONEachRow",
      });

      blobStorageRefs = [];
      batch++;
      logger.info(`Deleted ${batch * 500} event logs for ${projectId}`);
    }
  }
  // Delete any remaining files
  await eventStorageClient.deleteFiles(
    blobStorageRefs.map((r) => r.bucket_path),
  );
}
