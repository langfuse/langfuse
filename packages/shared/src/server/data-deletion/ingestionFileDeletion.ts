import { logger } from "..";
import { env } from "../../env";
import { clickhouseClient } from "../clickhouse/client";
import {
  getBlobStorageByProjectIdBeforeDate,
  getBlobStorageByProjectId,
  getBlobStorageByProjectIdAndEntityIds,
} from "../repositories";
import { getS3EventStorageClient } from "../s3";

export async function removeIngestionEventsFromS3AndDeleteClikhouseRefs(p: {
  projectId: string;
  cutoffDate: Date | undefined;
  entityIdProps:
    | {
        ids: string[];
        type: "observation" | "trace" | "score";
      }
    | undefined;
}) {
  const { projectId, cutoffDate, entityIdProps } = p;

  let batch = 0;
  const eventLogStream = cutoffDate
    ? getBlobStorageByProjectIdBeforeDate(projectId, cutoffDate)
    : entityIdProps
      ? getBlobStorageByProjectIdAndEntityIds(
          projectId,
          entityIdProps.type,
          entityIdProps.ids,
        )
      : getBlobStorageByProjectId(projectId);

  let blobStorageRefs = [];
  const eventStorageClient = getS3EventStorageClient(
    env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
  );
  for await (const eventLog of eventLogStream) {
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
