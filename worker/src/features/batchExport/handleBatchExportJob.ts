import { pipeline } from "stream";

import {
  BatchExportFileFormat,
  BatchExportQuerySchema,
  BatchExportQueryType,
  BatchExportStatus,
  exportOptions,
  FilterCondition,
  Prisma,
  TimeFilter,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  DatabaseReadStream,
  S3StorageService,
  createSessionsAllQuery,
  sendBatchExportSuccessEmail,
  streamTransformations,
  BatchExportJobType,
  createTracesQuery,
  createGenerationsQuery,
  parseGetAllGenerationsInput,
  parseTraceAllFilters,
  FullObservationsWithScores,
} from "@langfuse/shared/src/server";

import { env } from "../../env";
import { logger } from "@langfuse/shared/src/server";
import { BatchExportSessionsRow, BatchExportTracesRow } from "./types";

const tableNameToTimeFilterColumn = {
  sessions: "createdAt",
  traces: "timestamp",
  generations: "startTime",
};

const isGenerationTimestampFilter = (
  filter: FilterCondition
): filter is TimeFilter => {
  return filter.column === "Start Time" && filter.type === "datetime";
};

const isTraceTimestampFilter = (
  filter: FilterCondition
): filter is TimeFilter => {
  return filter.column === "Timestamp" && filter.type === "datetime";
};

const getEmptyScoreColumns = async (
  projectId: string,
  cutoffCreatedAt: Date,
  filter: FilterCondition[],
  isTimestampFilter: (filter: FilterCondition) => filter is TimeFilter
) => {
  const scoreTimestampFilter = filter?.find(isTimestampFilter);

  const scoreTimestampFilterCondition = scoreTimestampFilter
    ? Prisma.sql`AND s.timestamp >= ${scoreTimestampFilter.value}`
    : Prisma.empty;

  const distinctScoreNames = await prisma.$queryRaw<{ name: string }[]>`
        SELECT DISTINCT name
        FROM scores s
        WHERE s.project_id = ${projectId}
        AND s.created_at <= ${cutoffCreatedAt}
        ${scoreTimestampFilterCondition}
      `;

  return distinctScoreNames.reduce(
    (acc, { name }) => ({ ...acc, [name]: null }),
    {} as Record<string, null>
  );
};

const getChunkWithFlattenedScores = <
  T extends BatchExportTracesRow[] | FullObservationsWithScores,
>(
  chunk: T,
  emptyScoreColumns: Record<string, null>
) => {
  return chunk.map((row) => {
    const { scores, ...data } = row;
    if (!scores) return { ...data, ...emptyScoreColumns };
    const scoreColumns = Object.entries(scores).reduce<
      Record<string, string[] | number[] | null>
    >((acc, [key, value]) => {
      if (key in emptyScoreColumns) {
        return {
          ...acc,
          [key]: value,
        };
      } else {
        return acc;
      }
    }, emptyScoreColumns);
    return {
      ...data,
      ...scoreColumns,
    };
  });
};

const getDatabaseReadStream = async ({
  projectId,
  tableName,
  filter,
  orderBy,
  cutoffCreatedAt,
}: {
  projectId: string;
  cutoffCreatedAt: Date;
} & BatchExportQueryType): Promise<DatabaseReadStream<unknown>> => {
  // Set createdAt cutoff to prevent exporting data that was created after the job was queued
  const createdAtCutoffFilter: FilterCondition = {
    column: tableNameToTimeFilterColumn[tableName],
    operator: "<",
    value: cutoffCreatedAt,
    type: "datetime",
  };

  switch (tableName) {
    case "sessions":
      return new DatabaseReadStream<unknown>(
        async (pageSize: number, offset: number) => {
          const query = createSessionsAllQuery(
            Prisma.sql`
            s.id,
            s."created_at" AS "createdAt",
            s.bookmarked,
            s.public,
            t."userIds",
            t."countTraces",
            o."sessionDuration",
            o."inputCost" AS "inputCost",
            o."outputCost" AS "outputCost",
            o."totalCost" AS "totalCost",
            o."promptTokens" AS "inputTokens",
            o."completionTokens" AS "outputTokens",
            o."totalTokens" AS "totalTokens",
            t."tags" AS "traceTags",
            (count(*) OVER ())::int AS "totalCount" 
          `,
            {
              projectId,
              filter: filter
                ? [...filter, createdAtCutoffFilter]
                : [createdAtCutoffFilter],
              orderBy,
              limit: pageSize,
              page: Math.floor(offset / pageSize),
            }
          );
          const chunk = await prisma.$queryRaw<BatchExportSessionsRow[]>(query);

          return chunk;
        },
        1000,
        env.BATCH_EXPORT_ROW_LIMIT
      );
    case "generations": {
      const { orderByCondition, filterCondition, datetimeFilter } =
        parseGetAllGenerationsInput({
          projectId,
          orderBy,
          filter: filter
            ? [...filter, createdAtCutoffFilter]
            : [createdAtCutoffFilter],
        });

      const emptyScoreColumns = await getEmptyScoreColumns(
        projectId,
        cutoffCreatedAt,
        filter ? [...filter, createdAtCutoffFilter] : [createdAtCutoffFilter],
        isGenerationTimestampFilter
      );

      return new DatabaseReadStream<unknown>(
        async (pageSize: number, offset: number) => {
          const query = createGenerationsQuery({
            projectId,
            limit: pageSize,
            page: Math.floor(offset / pageSize),
            filterCondition,
            orderByCondition,
            datetimeFilter,
            selectScoreValues: true,
            selectIOAndMetadata: true,
          });
          const chunk =
            await prisma.$queryRaw<FullObservationsWithScores>(query);

          const chunkWithFlattenedScores = getChunkWithFlattenedScores(
            chunk,
            emptyScoreColumns
          );

          return chunkWithFlattenedScores;
        },
        1000,
        env.BATCH_EXPORT_ROW_LIMIT
      );
    }
    case "traces": {
      const { orderByCondition, filterCondition, observationTimeseriesFilter } =
        parseTraceAllFilters({
          projectId,
          orderBy,
          filter: filter
            ? [...filter, createdAtCutoffFilter]
            : [createdAtCutoffFilter],
        });

      const emptyScoreColumns = await getEmptyScoreColumns(
        projectId,
        cutoffCreatedAt,
        filter ? [...filter, createdAtCutoffFilter] : [createdAtCutoffFilter],
        isTraceTimestampFilter
      );

      return new DatabaseReadStream<unknown>(
        async (pageSize: number, offset: number) => {
          const query = createTracesQuery({
            select: Prisma.sql`
              t."bookmarked",
              t."id",
              t."timestamp",
              t."name",
              t."user_id" AS "userId",
              tm."level" AS "level",
              tl."observationCount" AS "observationCount",
              s_avg."scores_values" AS "scores",
              tl.latency AS "latency",
              t."release",
              t."version",
              t.session_id AS "sessionId",
              t."input",
              t."output",
              t."metadata",
              t."tags",
              COALESCE(tm."promptTokens", 0)::bigint AS "usage.promptTokens",
              COALESCE(tm."completionTokens", 0)::bigint AS "usage.completionTokens",
              COALESCE(tm."totalTokens", 0)::bigint AS "usage.totalTokens",
              COALESCE(tm."calculatedInputCost", 0)::numeric AS "inputCost",
              COALESCE(tm."calculatedOutputCost", 0)::numeric AS "outputCost",
              COALESCE(tm."calculatedTotalCost", 0)::numeric AS "totalCost"
              `,
            projectId,
            limit: pageSize,
            page: Math.floor(offset / pageSize),
            filterCondition,
            orderByCondition,
            observationTimeseriesFilter,
            selectScoreValues: true,
          });
          const chunk = await prisma.$queryRaw<BatchExportTracesRow[]>(query);

          const chunkWithFlattenedScores = getChunkWithFlattenedScores(
            chunk,
            emptyScoreColumns
          );

          return chunkWithFlattenedScores;
        },
        1000,
        env.BATCH_EXPORT_ROW_LIMIT
      );
    }
    default:
      throw new Error("Invalid table name: " + tableName);
  }
};

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
  const fileName = `${fileDate}-lf-${parsedQuery.data.tableName}-export-${projectId}.${fileExtension}`;
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
