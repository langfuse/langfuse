import { pipeline } from "stream";

import {
  BatchExportFileFormat,
  BatchExportJobType,
  BatchExportQuerySchema,
  BatchExportStatus,
  exportOptions,
  FilterCondition,
  getSessionTableSQL,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  DatabaseReadStream,
  S3StorageService,
  sendBatchExportSuccessEmail,
  streamTransformations,
} from "@langfuse/shared/src/server";

import { env } from "../../env";
import logger from "../../logger";

export const handleBatchExportJob = async (
  batchExportJob: BatchExportJobType
) => {
  const { projectId, batchExportId } = batchExportJob;

  // Get job details from DB
  const jobDetails = await prisma.batchExport.findFirst({
    where: {
      projectId,
      id: batchExportId,
    },
  });

  if (!jobDetails) {
    throw new Error("Job not found");
  }
  if (jobDetails.status !== BatchExportStatus.QUEUED) {
    throw new Error("Job has invalid status: " + jobDetails.status);
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
    throw new Error("Failed to parse query: " + parsedQuery.error.message);
  }

  // Get database read stream
  let { filter, orderBy, tableName } = parsedQuery.data;

  // Set createdAt cutoff to prevent exporting data that was created after the job was queued
  const createdAtCutoffFilter: FilterCondition = {
    column: "createdAt",
    operator: "<",
    value: jobDetails.createdAt,
    type: "datetime",
  };

  const dbReadStream = new DatabaseReadStream<unknown>(
    async (pageSize: number, offset: number) => {
      const query = getSessionTableSQL({
        projectId,
        filter: filter
          ? [...filter, createdAtCutoffFilter]
          : [createdAtCutoffFilter],
        orderBy,
        limit: pageSize,
        page: Math.floor(offset / pageSize),
      });

      const chunk = await prisma.$queryRaw<unknown[]>(query);

      return chunk;
    },
    1000,
    env.BATCH_EXPORT_ROW_LIMIT
  );

  // Transform data to desired format
  const fileStream = pipeline(
    dbReadStream,
    streamTransformations[jobDetails.format as BatchExportFileFormat](),
    (err) => {
      if (err) {
        console.error("Getting data from DB and transform failed: ", err);
      }
    }
  );

  // Stream upload results to S3
  const accessKeyId = env.S3_ACCESS_KEY_ID;
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY;
  const bucketName = env.S3_BUCKET_NAME;
  const endpoint = env.S3_ENDPOINT;
  const region = env.S3_REGION;

  if (!accessKeyId || !secretAccessKey || !bucketName || !endpoint || !region) {
    throw new Error("S3 credentials not found");
  }

  const fileDate = new Date().toISOString();
  const fileExtension =
    exportOptions[jobDetails.format as BatchExportFileFormat].extension;
  const fileName = `${fileDate}-lf-${tableName}-export-${projectId}.${fileExtension}`;
  const expiresInSeconds =
    env.BATCH_EXPORT_DOWNLOAD_LINK_EXPIRATION_HOURS * 3600;

  const { signedUrl } = await new S3StorageService({
    accessKeyId,
    secretAccessKey,
    bucketName,
    endpoint,
    region,
  }).uploadFile({
    fileName,
    fileType:
      exportOptions[jobDetails.format as BatchExportFileFormat].fileType,
    data: fileStream,
    expiresInSeconds,
  });

  logger.info(`Batch export file uploaded to S3`);

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
      expiresInHours: env.BATCH_EXPORT_DOWNLOAD_LINK_EXPIRATION_HOURS,
    });

    logger.info(`Batch export success email sent to user ${user.id}`);
  }
};
