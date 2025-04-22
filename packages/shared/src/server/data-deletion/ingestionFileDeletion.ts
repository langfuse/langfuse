import {
  BlobStorageFileRefRecordReadType,
  getBlobStorageByProjectId,
  getBlobStorageByProjectIdAndEntityIds,
  getBlobStorageByProjectIdAndTraceIds,
  getBlobStorageByProjectIdBeforeDate,
  logger,
} from "..";
import { env } from "../../env";
import { clickhouseClient } from "../clickhouse/client";
import { getS3EventStorageClient } from "../s3";

export const deleteIngestionEventsFromS3AndClickhouseForScores = async (p: {
  projectId: string;
  scoreIds: string[];
}) => {
  const stream = getBlobStorageByProjectIdAndEntityIds(
    p.projectId,
    "score",
    p.scoreIds,
  );

  return removeIngestionEventsFromS3AndDeleteClickhouseRefs({
    projectId: p.projectId,
    stream,
  });
};

export const removeIngestionEventsFromS3AndDeleteClickhouseRefsForTraces =
  async (p: { projectId: string; traceIds: string[] }) => {
    const stream = getBlobStorageByProjectIdAndTraceIds(
      p.projectId,
      p.traceIds,
    );

    return removeIngestionEventsFromS3AndDeleteClickhouseRefs({
      projectId: p.projectId,
      stream: stream,
    });
  };

export const removeIngestionEventsFromS3AndDeleteClickhouseRefsForProject = (
  projectId: string,
  cutOffDate: Date | undefined,
) => {
  const stream = cutOffDate
    ? getBlobStorageByProjectIdBeforeDate(projectId, cutOffDate)
    : getBlobStorageByProjectId(projectId);

  return removeIngestionEventsFromS3AndDeleteClickhouseRefs({
    projectId: projectId,
    stream: stream,
  });
};

async function removeIngestionEventsFromS3AndDeleteClickhouseRefs(p: {
  projectId: string;
  stream: AsyncGenerator<BlobStorageFileRefRecordReadType>;
}) {
  const { projectId, stream } = p;

  let batch = 0;

  let blobStorageRefs: BlobStorageFileRefRecordReadType[] = [];
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
      await softDeleteInClickhouse(blobStorageRefs);
      batch++;
      logger.info(
        `Deleted batch ${batch} of size ${blobStorageRefs.length} for ${projectId} of deleting s3 refs`,
      );
      blobStorageRefs = [];
    }
  }
  // Delete any remaining files
  await eventStorageClient.deleteFiles(
    blobStorageRefs.map((r) => r.bucket_path),
  );
  await softDeleteInClickhouse(blobStorageRefs);
  logger.info(
    `Deleted batch ${batch} of size ${blobStorageRefs.length} for ${projectId} of deleting s3 refs`,
  );
}

async function softDeleteInClickhouse(
  blobStorageRefs: BlobStorageFileRefRecordReadType[],
) {
  await clickhouseClient().insert({
    table: "blob_storage_file_log",
    values: blobStorageRefs.map((e) => ({
      ...e,
      is_deleted: "1",
      event_ts: new Date().getTime(),
      updated_at: new Date().getTime(),
    })),
    format: "JSONEachRow",
  });
}
