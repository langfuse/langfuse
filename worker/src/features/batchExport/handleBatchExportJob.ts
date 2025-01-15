import { pipeline } from "stream";
import {
  BatchExportFileFormat,
  BatchExportQuerySchema,
  BatchExportQueryType,
  BatchExportStatus,
  exportOptions,
  FilterCondition,
  Prisma,
  Score,
  TimeFilter,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  DatabaseReadStream,
  StorageServiceFactory,
  createSessionsAllQuery,
  sendBatchExportSuccessEmail,
  streamTransformations,
  BatchExportJobType,
  createTracesQuery,
  createGenerationsQuery,
  parseGetAllGenerationsInput,
  parseTraceAllFilters,
  FullObservationsWithScores,
  getPublicSessionsFilter,
  getScoresForObservations,
  getObservationsTableWithModelData,
  getDistinctScoreNames,
  getTracesTable,
  getTracesTableMetrics,
  getScoresForTraces,
  logger,
  getTracesByIds,
  getSessionsWithMetrics,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import { BatchExportSessionsRow, BatchExportTracesRow } from "./types";
import Decimal from "decimal.js";

const tableNameToTimeFilterColumn = {
  sessions: "createdAt",
  traces: "timestamp",
  generations: "startTime",
};

const tableNameToTimeFilterColumnCh = {
  sessions: "createdAt",
  traces: "timestamp",
  generations: "startTime",
};

const isGenerationTimestampFilter = (
  filter: FilterCondition,
): filter is TimeFilter => {
  return filter.column === "Start Time" && filter.type === "datetime";
};

const isTraceTimestampFilter = (
  filter: FilterCondition,
): filter is TimeFilter => {
  return filter.column === "Timestamp" && filter.type === "datetime";
};

const getEmptyScoreColumns = async (
  projectId: string,
  cutoffCreatedAt: Date,
  filter: FilterCondition[],
  isTimestampFilter: (filter: FilterCondition) => filter is TimeFilter,
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
    {} as Record<string, null>,
  );
};

const getChunkWithFlattenedScores = <
  T extends BatchExportTracesRow[] | FullObservationsWithScores,
>(
  chunk: T,
  emptyScoreColumns: Record<string, null>,
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

export const getDatabaseReadStream = async ({
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

  const createdAtCutoffFilterCh = {
    column: tableNameToTimeFilterColumnCh[tableName],
    operator: "<" as const,
    value: cutoffCreatedAt,
    type: "datetime" as const,
  };

  switch (tableName) {
    case "sessions":
      return new DatabaseReadStream<unknown>(
        async (pageSize: number, offset: number) => {
          const finalFilter = filter
            ? [...filter, createdAtCutoffFilter]
            : [createdAtCutoffFilter];

          const sessionsFilter = await getPublicSessionsFilter(
            projectId,
            finalFilter ?? [],
          );
          const sessions = await getSessionsWithMetrics({
            projectId: projectId,
            filter: sessionsFilter,
            orderBy: orderBy,
            limit: pageSize,
            page: Math.floor(offset / pageSize),
          });

          const prismaSessionInfo = await prisma.traceSession.findMany({
            where: {
              id: {
                in: sessions.map((s) => s.session_id),
              },
              projectId: projectId,
            },
            select: {
              id: true,
              bookmarked: true,
              public: true,
            },
          });
          return sessions.map((s) => {
            const row: BatchExportSessionsRow = {
              id: s.session_id,
              userIds: s.user_ids,
              countTraces: s.trace_ids.length,
              sessionDuration: Number(s.duration) / 1000,
              inputCost: new Decimal(s.session_input_cost),
              outputCost: new Decimal(s.session_output_cost),
              totalCost: new Decimal(s.session_total_cost),
              totalTokens: BigInt(s.session_total_usage),
              traceTags: s.trace_tags,
              createdAt: new Date(s.min_timestamp),
              bookmarked:
                prismaSessionInfo.find((p) => p.id === s.session_id)
                  ?.bookmarked ?? false,
              public:
                prismaSessionInfo.find((p) => p.id === s.session_id)?.public ??
                false,
              totalCount: s.trace_count,
            };
            return row;
          });
        },
        1000,
        env.BATCH_EXPORT_ROW_LIMIT,
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

      let emptyScoreColumns: Record<string, null>;

      return new DatabaseReadStream<unknown>(
        async (pageSize: number, offset: number) => {
          const distinctScoreNames = await getDistinctScoreNames(
            projectId,
            cutoffCreatedAt,
            filter
              ? [...filter, createdAtCutoffFilterCh]
              : [createdAtCutoffFilterCh],
            isGenerationTimestampFilter,
          );

          emptyScoreColumns = distinctScoreNames.reduce(
            (acc, name) => ({ ...acc, [name]: null }),
            {} as Record<string, null>,
          );

          const generations = await getObservationsTableWithModelData({
            projectId,
            limit: pageSize,
            offset: offset,
            filter: filter
              ? [...filter, createdAtCutoffFilterCh]
              : [createdAtCutoffFilterCh],
            orderBy: orderBy,
            selectIOAndMetadata: true,
          });
          const scores = await getScoresForObservations(
            projectId,
            generations.map((gen) => gen.id),
          );

          const chunk = generations.map((generation) => {
            const filteredScores = scores.filter(
              (s) => s.observationId === generation.id,
            );

            const outputScores: Record<string, string[] | number[]> =
              prepareScoresForOutput(filteredScores);

            return {
              ...generation,
              scores: outputScores,
            };
          });

          return getChunkWithFlattenedScores(chunk, emptyScoreColumns);
        },
        1000,
        env.BATCH_EXPORT_ROW_LIMIT,
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

      let emptyScoreColumns: Record<string, null>;

      return new DatabaseReadStream<unknown>(
        async (pageSize: number, offset: number) => {
          const distinctScoreNames = await getDistinctScoreNames(
            projectId,
            cutoffCreatedAt,
            filter
              ? [...filter, createdAtCutoffFilter]
              : [createdAtCutoffFilter],
            isTraceTimestampFilter,
          );
          emptyScoreColumns = distinctScoreNames.reduce(
            (acc, name) => ({ ...acc, [name]: null }),
            {} as Record<string, null>,
          );

          const traces = await getTracesTable(
            projectId,
            filter
              ? [...filter, createdAtCutoffFilter]
              : [createdAtCutoffFilter],
            undefined,
            orderBy,
            pageSize,
            Math.floor(offset / pageSize),
          );

          const [metrics, fullTraces] = await Promise.all([
            getTracesTableMetrics({
              projectId,
              filter: [
                ...(filter ?? []),
                {
                  type: "stringOptions",
                  operator: "any of",
                  column: "ID",
                  value: traces.map((t) => t.id),
                },
              ],
            }),
            getTracesByIds(
              traces.map((t) => t.id),
              projectId,
              traces.reduce(
                (min, t) => (!min || t.timestamp < min ? t.timestamp : min),
                undefined as Date | undefined,
              ),
            ),
          ]);

          const scores = await getScoresForTraces({
            projectId,
            traceIds: traces.map((t) => t.id),
          });

          const chunk = traces.map((t) => {
            const metric = metrics.find((m) => m.id === t.id);
            const filteredScores = scores.filter((s) => s.traceId === t.id);

            const outputScores: Record<string, string[] | number[]> =
              prepareScoresForOutput(filteredScores);
            const fullTrace = fullTraces.find(
              (fullTrace) => fullTrace.id === t.id,
            );

            return {
              ...t,
              input: fullTrace?.input,
              output: fullTrace?.output,
              metadata: fullTrace?.metadata,
              latency: metric?.latency,
              name: t.name ?? "",
              usage: {
                promptTokens: metric?.promptTokens,
                completionTokens: metric?.completionTokens,
                totalTokens: metric?.totalTokens,
              },
              inputCost: metric?.calculatedInputCost,
              outputCost: metric?.calculatedOutputCost,
              totalCost: metric?.calculatedTotalCost,
              level: metric?.level,
              observationCount: Number(metric?.observationCount),
              scores: outputScores,
              inputTokens: metric?.promptTokens,
              outputTokens: metric?.completionTokens,
              totalTokens: metric?.totalTokens,
            };
          });

          return getChunkWithFlattenedScores(chunk, emptyScoreColumns);
        },
        1000,
        env.BATCH_EXPORT_ROW_LIMIT,
      );
    }
    default:
      throw new Error("Invalid table name: " + tableName);
  }
};

export const handleBatchExportJob = async (
  batchExportJob: BatchExportJobType,
) => {
  if (env.LANGFUSE_S3_BATCH_EXPORT_ENABLED !== "true") {
    throw new Error(
      "Batch export is not enabled. Configure environment variables to use this feature.",
    );
  }

  const { projectId, batchExportId } = batchExportJob;

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
    throw new Error(
      `Job ${batchExportId} has invalid status: ${jobDetails.status}`,
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

  const fileDate = new Date().toISOString();
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
    region: env.LANGFUSE_S3_BATCH_EXPORT_REGION,
    forcePathStyle: env.LANGFUSE_S3_BATCH_EXPORT_FORCE_PATH_STYLE === "true",
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

    logger.info(`Batch export success email sent to user ${user.id}`);
  }
};
function prepareScoresForOutput(
  filteredScores: Score[],
): Record<string, string[] | number[]> {
  return filteredScores.reduce(
    (acc, score) => {
      // If this score name already exists in acc, use its existing type
      const existingValues = acc[score.name];
      const newValue =
        score.dataType === "NUMERIC" ? score.value : score.stringValue;
      if (!newValue) return acc;

      if (!existingValues) {
        // First value determines the type
        if (typeof newValue === "number") {
          acc[score.name] = [newValue] as number[];
        } else {
          acc[score.name] = [String(newValue)] as string[];
        }
      } else if (typeof newValue === typeof existingValues[0]) {
        // Only add if same type as existing values
        if (typeof newValue === "number") {
          acc[score.name] = [...existingValues, newValue] as number[];
        } else {
          acc[score.name] = [...existingValues, String(newValue)] as string[];
        }
      }
      return acc;
    },
    {} as Record<string, string[] | number[]>,
  );
}
