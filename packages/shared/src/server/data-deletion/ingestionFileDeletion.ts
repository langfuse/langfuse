import {
  getBlobStorageByProjectId,
  getBlobStorageByProjectIdAndEntityIds,
  getBlobStorageByProjectIdAndTraceIds,
  getBlobStorageByProjectIdBeforeDate,
} from "../repositories/blobStorageLog";
import { BlobStorageFileRefRecordReadType } from "../repositories/definitions";
import { logger } from "../logger";
import { env } from "../../env";
import { clickhouseClient } from "../clickhouse/client";
import {
  buildClickHouseLogComment,
  type ClickHouseQueryContextTags,
} from "../clickhouse/queryTags";
import { getS3EventStorageClient } from "../s3";

export const deleteIngestionEventsFromS3AndClickhouseForScores = async (p: {
  projectId: string;
  scoreIds: string[];
  clickHouseQueryTags?: ClickHouseQueryContextTags;
}) => {
  const stream = getBlobStorageByProjectIdAndEntityIds(
    p.projectId,
    "score",
    p.scoreIds,
  );

  return removeIngestionEventsFromS3AndDeleteClickhouseRefs({
    projectId: p.projectId,
    stream,
    clickHouseQueryTags: p.clickHouseQueryTags,
  });
};

export const removeIngestionEventsFromS3AndDeleteClickhouseRefsForTraces =
  async (p: {
    projectId: string;
    traceIds: string[];
    clickHouseQueryTags?: ClickHouseQueryContextTags;
  }) => {
    const stream = getBlobStorageByProjectIdAndTraceIds(
      p.projectId,
      p.traceIds,
    );

    return removeIngestionEventsFromS3AndDeleteClickhouseRefs({
      projectId: p.projectId,
      stream: stream,
      clickHouseQueryTags: p.clickHouseQueryTags,
    });
  };

export const removeIngestionEventsFromS3AndDeleteClickhouseRefsForProject = (
  projectId: string,
  cutOffDate: Date | undefined,
  clickHouseQueryTags?: ClickHouseQueryContextTags,
) => {
  const stream = cutOffDate
    ? getBlobStorageByProjectIdBeforeDate(projectId, cutOffDate)
    : getBlobStorageByProjectId(projectId);

  return removeIngestionEventsFromS3AndDeleteClickhouseRefs({
    projectId: projectId,
    stream: stream,
    clickHouseQueryTags,
  });
};

async function removeIngestionEventsFromS3AndDeleteClickhouseRefs(p: {
  projectId: string;
  stream: AsyncGenerator<BlobStorageFileRefRecordReadType>;
  clickHouseQueryTags?: ClickHouseQueryContextTags;
}) {
  const { projectId, stream, clickHouseQueryTags } = p;

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
      await softDeleteInClickhouse(blobStorageRefs, {
        projectId,
        clickHouseQueryTags,
      });
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
  await softDeleteInClickhouse(blobStorageRefs, {
    projectId,
    clickHouseQueryTags,
  });
  logger.info(
    `Deleted last batch ${batch} of size ${blobStorageRefs.length} for ${projectId} of deleting s3 refs`,
  );
}

async function softDeleteInClickhouse(
  blobStorageRefs: BlobStorageFileRefRecordReadType[],
  p: {
    projectId: string;
    clickHouseQueryTags?: ClickHouseQueryContextTags;
  },
) {
  if (blobStorageRefs.length === 0) {
    return;
  }

  await clickhouseClient().insert({
    table: "blob_storage_file_log",
    values: blobStorageRefs.map((e) => ({
      ...e,
      is_deleted: "1",
      event_ts: new Date().getTime(),
      updated_at: new Date().getTime(),
    })),
    format: "JSONEachRow",
    clickhouse_settings: {
      log_comment: buildClickHouseLogComment({
        ...p.clickHouseQueryTags,
        feature: "deletion",
        projectId: p.projectId,
      }),
    },
  });
}
