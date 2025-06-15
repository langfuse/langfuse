import { pipeline } from "stream";
import {
  BatchExportFileFormat,
  BatchExportQuerySchema,
  BatchExportStatus,
  exportOptions,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  StorageServiceFactory,
  sendBatchExportSuccessEmail,
  streamTransformations,
  type BatchExportJobType,
  logger,
  getCurrentSpan,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import { getDatabaseReadStream } from "../database-read-stream/getDatabaseReadStream";

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
    throw new Error(
      `Job not found for project: ${projectId} and export ${batchExportId}`,
    );
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

  // handle db read stream
  const dbReadStream = await getDatabaseReadStream({
    projectId,
    cutoffCreatedAt: jobDetails.createdAt,
    ...parsedQuery.data,
  });

  // Transform data to desired format
  const fileStream = pipeline(
    dbReadStream,
    streamTransformations[jobDetails.format as BatchExportFileFormat](),
    (err) => {
      if (err) {
        logger.error("Getting data from DB and transform failed: ", err);
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
  }).uploadFile({
    fileName,
    fileType:
      exportOptions[jobDetails.format as BatchExportFileFormat].fileType,
    data: fileStream,
    expiresInSeconds,
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
