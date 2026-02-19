import { pipeline, Transform } from "stream";
import {
  BatchExportFileFormat,
  BatchExportQuerySchema,
  BatchExportStatus,
  BatchExportTableName,
  exportOptions,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  StorageServiceFactory,
  sendBatchExportSuccessEmail,
  streamTransformations,
  type BatchExportJobType,
  logger,
  getCurrentSpan,
  applyCommentFilters,
  type CommentObjectType,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import { getDatabaseReadStreamPaginated } from "../database-read-stream/getDatabaseReadStream";
import { getObservationStream } from "../database-read-stream/observation-stream";
import { getTraceStream } from "../database-read-stream/trace-stream";
import { getEventsStream } from "../database-read-stream/event-stream";

// Map table names to comment object types for preprocessing
const tableToCommentType: Record<string, CommentObjectType | undefined> = {
  traces: "TRACE",
  observations: "OBSERVATION",
  sessions: "SESSION",
};

export const handleBatchExportJob = async (
  batchExportJob: BatchExportJobType,
) => {
  if (env.LANGFUSE_S3_BATCH_EXPORT_ENABLED !== "true") {
    throw new Error(
      "Batch export is not enabled. Configure environment variables to use this feature. See https://langfuse.com/self-hosting/infrastructure/blobstorage#batch-exports for more details.",
    );
  }

  const { projectId, batchExportId } = batchExportJob;

  logger.info(`Starting batch export for ${projectId} and ${batchExportId}`);

  const span = getCurrentSpan();
  if (span) {
    span.setAttribute(
      "messaging.bullmq.job.input.batchExportId",
      batchExportId,
    );
    span.setAttribute("messaging.bullmq.job.input.projectId", projectId);
  }

  // Get job details from DB
  const jobDetails = await prisma.batchExport.findFirst({
    where: {
      projectId,
      id: batchExportId,
    },
  });

  if (!jobDetails) {
    throw new LangfuseNotFoundError(
      `Job not found for project: ${projectId} and export ${batchExportId}`,
    );
  }

  // Check if the batch export has been cancelled
  if (jobDetails.status === BatchExportStatus.CANCELLED) {
    logger.info(
      `Batch export ${batchExportId} has been cancelled. Skipping processing.`,
    );
    return; // Exit early without processing
  }

  // Check if the batch export is older than 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  if (jobDetails.createdAt < thirtyDaysAgo) {
    // For old exports, mark as failed with an informative message
    const improvedExportMessage =
      "We have improved the batch export feature. Please retry your export to benefit from the latest enhancements.";

    await prisma.batchExport.update({
      where: {
        id: batchExportId,
        projectId,
      },
      data: {
        status: BatchExportStatus.FAILED,
        finishedAt: new Date(),
        log: improvedExportMessage,
      },
    });

    logger.info(
      `Batch export ${batchExportId} is older than 30 days. Marked as failed with retry message.`,
    );

    return; // Exit early without processing
  }

  if (jobDetails.status !== BatchExportStatus.QUEUED) {
    logger.warn(
      `Job ${batchExportId} has invalid status: ${jobDetails.status}. Retrying anyway.`,
    );
  }

  // Set job status to processing
  await prisma.batchExport.update({
    where: {
      id: batchExportId,
      projectId,
    },
    data: {
      status: BatchExportStatus.PROCESSING,
    },
  });

  // Parse query from job
  const parsedQuery = BatchExportQuerySchema.safeParse(jobDetails.query);
  if (!parsedQuery.success) {
    throw new Error(
      `Failed to parse query for ${batchExportId}: ${parsedQuery.error.message}`,
    );
  }

  if (span) {
    span.setAttribute(
      "messaging.bullmq.job.input.query",
      JSON.stringify(parsedQuery.data),
    );
  }

  // Process comment filters before creating stream
  const commentObjectType = tableToCommentType[parsedQuery.data.tableName];
  let processedFilter = parsedQuery.data.filter ?? [];

  if (commentObjectType) {
    const { filterState, hasNoMatches } = await applyCommentFilters({
      filterState: parsedQuery.data.filter ?? [],
      prisma,
      projectId,
      objectType: commentObjectType,
    });

    if (hasNoMatches) {
      // No matching items - complete export with empty results
      logger.info(
        `Batch export ${batchExportId}: comment filter matched no items, completing with empty export`,
      );

      // Create an empty stream by using a filter that matches nothing
      processedFilter = [
        {
          type: "stringOptions" as const,
          operator: "any of" as const,
          column: "id",
          value: [],
        },
      ];
    } else {
      processedFilter = filterState;
    }
  }

  // handle db read stream

  const dbReadStream =
    parsedQuery.data.tableName === BatchExportTableName.Observations
      ? await getObservationStream({
          projectId,
          cutoffCreatedAt: jobDetails.createdAt,
          ...parsedQuery.data,
          filter: processedFilter,
        })
      : parsedQuery.data.tableName === BatchExportTableName.Traces
        ? await getTraceStream({
            projectId,
            cutoffCreatedAt: jobDetails.createdAt,
            ...parsedQuery.data,
            filter: processedFilter,
          })
        : parsedQuery.data.tableName === BatchExportTableName.Events
          ? await getEventsStream({
              projectId,
              cutoffCreatedAt: jobDetails.createdAt,
              ...parsedQuery.data,
              filter: processedFilter,
            })
          : await getDatabaseReadStreamPaginated({
              projectId,
              cutoffCreatedAt: jobDetails.createdAt,
              ...parsedQuery.data,
              filter: processedFilter,
            });

  // Transform data to desired format
  let rowCount = 0;

  const loggingTransform = new Transform({
    objectMode: true,
    transform(chunk, encoding, callback) {
      rowCount++;
      if (rowCount % 5000 === 0) {
        logger.info(
          `Batch export ${batchExportId}: processed ${rowCount} rows`,
        );
      }
      callback(null, chunk);
    },
  });

  const fileStream = pipeline(
    dbReadStream,
    loggingTransform,
    streamTransformations[jobDetails.format as BatchExportFileFormat](),
    (err) => {
      if (err) {
        logger.error("Getting data from DB and transform failed: ", err);
      } else {
        logger.info(
          `Batch export ${batchExportId}: completed processing ${rowCount} total rows`,
        );
      }
    },
  );

  const fileDate = new Date().getTime();
  const fileExtension =
    exportOptions[jobDetails.format as BatchExportFileFormat].extension;
  const fileName = `${env.LANGFUSE_S3_BATCH_EXPORT_PREFIX}${fileDate}-lf-${parsedQuery.data.tableName}-export-${projectId}.${fileExtension}`;
  const expiresInSeconds =
    env.BATCH_EXPORT_DOWNLOAD_LINK_EXPIRATION_HOURS * 3600;

  // Stream upload results to S3
  const bucketName = env.LANGFUSE_S3_BATCH_EXPORT_BUCKET;
  if (!bucketName) {
    throw new Error("No S3 bucket configured for exports.");
  }

  const { signedUrl } = await StorageServiceFactory.getInstance({
    bucketName,
    accessKeyId: env.LANGFUSE_S3_BATCH_EXPORT_ACCESS_KEY_ID,
    secretAccessKey: env.LANGFUSE_S3_BATCH_EXPORT_SECRET_ACCESS_KEY,
    endpoint: env.LANGFUSE_S3_BATCH_EXPORT_ENDPOINT,
    externalEndpoint: env.LANGFUSE_S3_BATCH_EXPORT_EXTERNAL_ENDPOINT,
    region: env.LANGFUSE_S3_BATCH_EXPORT_REGION,
    forcePathStyle: env.LANGFUSE_S3_BATCH_EXPORT_FORCE_PATH_STYLE === "true",
    awsSse: env.LANGFUSE_S3_BATCH_EXPORT_SSE,
    awsSseKmsKeyId: env.LANGFUSE_S3_BATCH_EXPORT_SSE_KMS_KEY_ID,
  }).uploadWithSignedUrl({
    fileName,
    fileType:
      exportOptions[jobDetails.format as BatchExportFileFormat].fileType,
    data: fileStream,
    expiresInSeconds,
    partSize: env.BATCH_EXPORT_S3_PART_SIZE_MIB * 1024 * 1024,
    queueSize: 4,
  });

  logger.info(`Batch export file ${fileName} uploaded to S3`);

  // Update job status
  await prisma.batchExport.update({
    where: {
      id: batchExportId,
      projectId,
    },
    data: {
      status: BatchExportStatus.COMPLETED,
      url: signedUrl,
      finishedAt: new Date(),
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    },
  });

  // Send email to user
  const user = await prisma.user.findFirst({
    where: {
      id: jobDetails.userId,
    },
  });

  if (user?.email) {
    await sendBatchExportSuccessEmail({
      env,
      receiverEmail: user.email,
      downloadLink: signedUrl,
      userName: user?.name || "",
      batchExportName: jobDetails.name,
    });

    logger.info(
      `Batch export with id ${batchExportId} for project ${projectId} successful. Email sent to user ${user.id}`,
    );
  }
};
