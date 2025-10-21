import {
  BatchTableNames,
  FilterCondition,
  TimeFilter,
  BatchExportQueryType,
  evalDatasetFormFilterCols,
  OrderByState,
  TracingSearchType,
  ScoreDataType,
  isPresent,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  FullObservationsWithScores,
  DatabaseReadStream,
  getScoresUiTable,
  getPublicSessionsFilter,
  getSessionsWithMetrics,
  getDistinctScoreNames,
  getObservationsTableWithModelData,
  getScoresForObservations,
  getTracesTable,
  getTracesTableMetrics,
  getTracesByIds,
  getScoresForTraces,
  tableColumnsToSqlFilterAndPrefix,
  getTraceIdentifiers,
  getDatasetRunItemsCh,
} from "@langfuse/shared/src/server";
import Decimal from "decimal.js";
import { env } from "../../env";
import { BatchExportTracesRow, BatchExportSessionsRow } from "./types";
import { fetchCommentsForExport } from "./fetchCommentsForExport";

const tableNameToTimeFilterColumn: Record<BatchTableNames, string> = {
  scores: "timestamp",
  sessions: "createdAt",
  traces: "timestamp",
  observations: "startTime",
  dataset_run_items: "createdAt",
  dataset_items: "createdAt",
  audit_logs: "createdAt",
};
const tableNameToTimeFilterColumnCh: Record<BatchTableNames, string> = {
  scores: "timestamp",
  sessions: "createdAt",
  traces: "timestamp",
  observations: "startTime",
  dataset_run_items: "createdAt",
  dataset_items: "createdAt",
  audit_logs: "createdAt",
};
const isGenerationTimestampFilter = (
  filter: FilterCondition,
): filter is TimeFilter => {
  return filter.column === "Start Time" && filter.type === "datetime";
};
export const isTraceTimestampFilter = (
  filter: FilterCondition,
): filter is TimeFilter => {
  return filter.column === "Timestamp" && filter.type === "datetime";
};
export const getChunkWithFlattenedScores = <
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

export const getDatabaseReadStreamPaginated = async ({
  projectId,
  tableName,
  filter,
  orderBy,
  cutoffCreatedAt,
  searchQuery,
  searchType,
  rowLimit = env.BATCH_EXPORT_ROW_LIMIT,
}: {
  projectId: string;
  cutoffCreatedAt: Date;
  searchQuery?: string;
  searchType?: TracingSearchType[];
  rowLimit?: number;
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

  const clickhouseConfigs = {
    request_timeout: 120_000,
  };

  switch (tableName) {
    case "scores": {
      return new DatabaseReadStream<unknown>(
        async (pageSize: number, offset: number) => {
          const scores = await getScoresUiTable({
            projectId,
            filter: filter
              ? [...filter, createdAtCutoffFilter]
              : [createdAtCutoffFilter],
            orderBy,
            limit: pageSize,
            offset,
            clickhouseConfigs,
          });

          // Get author user info for scores
          // Only users that have valid project write access may write scores
          // Only users with at least MEMBER permissions (projectMembers:read) may trigger batch exports
          const users = await prisma.user.findMany({
            where: {
              id: {
                in: scores
                  .map((score) => score.authorUserId)
                  .filter((s): s is string => Boolean(s)),
              },
            },
            select: {
              id: true,
              name: true,
            },
          });

          return scores.map((score) => {
            const user = users.find((u) => u.id === score.authorUserId);
            return {
              id: score.id,
              traceId: score.traceId,
              sessionId: score.sessionId,
              datasetRunId: score.datasetRunId,
              timestamp: score.timestamp,
              source: score.source,
              name: score.name,
              dataType: score.dataType,
              value: score.value,
              stringValue: score.stringValue,
              comment: score.comment,
              metadata: score.metadata,
              observationId: score.observationId,
              traceName: score.traceName,
              userId: score.traceUserId,
              traceTags: score.traceTags,
              environment: score.environment,
              authorUserName: user?.name ?? null,
            };
          });
        },
        env.BATCH_EXPORT_PAGE_SIZE,
        rowLimit,
      );
    }

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
            clickhouseConfigs,
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
          const rows = sessions.map((s) => {
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

          // Fetch comments for all sessions in this page
          const sessionComments = await fetchCommentsForExport(
            projectId,
            "SESSION",
            sessions.map((s) => s.session_id),
          );

          // Fetch all trace IDs for all sessions
          const allTraceIds = sessions.flatMap((s) => s.trace_ids);

          // Fetch trace data, scores, and comments if there are any traces
          let tracesData: any[] = [];
          let scoresData: any[] = [];
          let traceComments = new Map<string, any[]>();

          if (allTraceIds.length > 0) {
            const minTimestamp = sessions.reduce(
              (min, s) => {
                const sessionTime = new Date(s.min_timestamp);
                return !min || sessionTime < min ? sessionTime : min;
              },
              undefined as Date | undefined,
            );

            [tracesData, scoresData, traceComments] = await Promise.all([
              getTracesByIds(
                allTraceIds,
                projectId,
                minTimestamp,
                clickhouseConfigs,
              ),
              getScoresForTraces({
                projectId,
                traceIds: allTraceIds,
                clickhouseConfigs,
              }),
              fetchCommentsForExport(projectId, "TRACE", allTraceIds),
            ]);
          }

          // Add comments and traces to each session
          return rows.map((row) => {
            // Get traces for this session
            const sessionTraces = sessions.find((s) => s.session_id === row.id);
            const traceIdsForSession = sessionTraces?.trace_ids ?? [];

            // Build traces array with scores and comments
            const traces = traceIdsForSession
              .map((traceId) => {
                const trace = tracesData.find((t) => t.id === traceId);
                if (!trace) return null;

                const traceScores = scoresData.filter(
                  (s) => s.traceId === traceId,
                );

                return {
                  id: trace.id,
                  timestamp: trace.timestamp,
                  name: trace.name,
                  userId: trace.userId,
                  metadata: trace.metadata,
                  release: trace.release,
                  version: trace.version,
                  environment: trace.environment,
                  public: trace.public,
                  bookmarked: trace.bookmarked,
                  tags: trace.tags,
                  input: trace.input,
                  output: trace.output,
                  sessionId: trace.sessionId,
                  scores: traceScores.map((score) => ({
                    id: score.id,
                    name: score.name,
                    value: score.value,
                    stringValue: score.stringValue,
                    dataType: score.dataType,
                    source: score.source,
                    comment: score.comment,
                    authorUserId: score.authorUserId,
                    timestamp: score.timestamp,
                  })),
                  comments: traceComments.get(traceId) ?? [],
                };
              })
              .filter(isPresent);

            return {
              ...row,
              traces,
              comments: sessionComments.get(row.id) ?? [],
            };
          });
        },
        env.BATCH_EXPORT_PAGE_SIZE,
        rowLimit,
      );
    case "observations": {
      let emptyScoreColumns: Record<string, null>;

      return new DatabaseReadStream<unknown>(
        async (pageSize: number, offset: number) => {
          const distinctScoreNames = await getDistinctScoreNames({
            projectId,
            cutoffCreatedAt,
            filter: filter
              ? [...filter, createdAtCutoffFilterCh]
              : [createdAtCutoffFilterCh],
            isTimestampFilter: isGenerationTimestampFilter,
            clickhouseConfigs,
          });

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
            searchQuery,
            searchType: searchType ?? ["id" as const],
            orderBy,
            selectIOAndMetadata: true,
            clickhouseConfigs,
          });
          const scores = await getScoresForObservations({
            projectId,
            observationIds: generations.map((gen) => gen.id),
            clickhouseConfigs,
          });

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

          // Fetch comments for all observations in this page
          const observationComments = await fetchCommentsForExport(
            projectId,
            "OBSERVATION",
            generations.map((g) => g.id),
          );

          // Add comments to flattened chunk
          const flattenedChunk = getChunkWithFlattenedScores(
            chunk,
            emptyScoreColumns,
          );

          return flattenedChunk.map((obs: any) => ({
            ...obs,
            comments: observationComments.get(obs.id) ?? [],
          }));
        },
        env.BATCH_EXPORT_PAGE_SIZE,
        rowLimit,
      );
    }
    case "traces": {
      let emptyScoreColumns: Record<string, null>;

      return new DatabaseReadStream<unknown>(
        async (pageSize: number, offset: number) => {
          const distinctScoreNames = await getDistinctScoreNames({
            projectId,
            cutoffCreatedAt,
            filter: filter
              ? [...filter, createdAtCutoffFilter]
              : [createdAtCutoffFilter],
            isTimestampFilter: isTraceTimestampFilter,
            clickhouseConfigs,
          });
          emptyScoreColumns = distinctScoreNames.reduce(
            (acc, name) => ({ ...acc, [name]: null }),
            {} as Record<string, null>,
          );

          const traces = await getTracesTable({
            projectId,
            filter: filter
              ? [...filter, createdAtCutoffFilter]
              : [createdAtCutoffFilter],
            searchQuery,
            searchType: searchType ?? ["id" as const],
            orderBy,
            limit: pageSize,
            page: Math.floor(offset / pageSize),
            clickhouseConfigs,
          });

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
              clickhouseConfigs,
            }),
            getTracesByIds(
              traces.map((t) => t.id),
              projectId,
              traces.reduce(
                (min, t) => (!min || t.timestamp < min ? t.timestamp : min),
                undefined as Date | undefined,
              ),
              {
                request_timeout: 120_000,
              },
            ),
          ]);

          const scores = await getScoresForTraces({
            projectId,
            traceIds: traces.map((t) => t.id),
            clickhouseConfigs,
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
              errorCount: metric?.errorCount,
              warningCount: metric?.warningCount,
              defaultCount: metric?.defaultCount,
              debugCount: metric?.debugCount,
              observationCount: Number(metric?.observationCount),
              scores: outputScores,
              inputTokens: metric?.promptTokens,
              outputTokens: metric?.completionTokens,
              totalTokens: metric?.totalTokens,
            };
          });

          // Fetch comments for all traces in this page
          const traceComments = await fetchCommentsForExport(
            projectId,
            "TRACE",
            traces.map((t) => t.id),
          );

          // Add comments to each trace
          const chunkWithComments = chunk.map((trace) => ({
            ...trace,
            comments: traceComments.get(trace.id) ?? [],
          }));

          return getChunkWithFlattenedScores(
            chunkWithComments,
            emptyScoreColumns,
          );
        },
        env.BATCH_EXPORT_PAGE_SIZE,
        rowLimit,
      );
    }

    case "dataset_run_items": {
      return new DatabaseReadStream<unknown>(
        async (pageSize: number, offset: number) => {
          const items = await getDatasetRunItemsCh({
            projectId,
            filter: filter
              ? [...filter, createdAtCutoffFilter]
              : [createdAtCutoffFilter],
            limit: pageSize,
            orderBy: {
              column: "createdAt",
              order: "DESC",
            },
            offset,
            clickhouseConfigs,
          });

          // fetch all project dataset names
          const datasets = await prisma.dataset.findMany({
            where: {
              projectId,
            },
            select: {
              id: true,
              name: true,
            },
          });

          return items.map((item) => {
            const datasetName = datasets.find(
              (d) => d.id === item.datasetId,
            )?.name;

            return {
              id: item.id,
              projectId: item.projectId,
              datasetItemId: item.datasetItemId,
              traceId: item.traceId,
              observationId: item.observationId,
              createdAt: item.createdAt,
              updatedAt: item.updatedAt,
              datasetName: datasetName ?? "Unknown",
            };
          });
        },
        env.BATCH_EXPORT_PAGE_SIZE,
        rowLimit,
      );
    }

    case "dataset_items": {
      return new DatabaseReadStream<unknown>(
        async (pageSize: number, offset: number) => {
          const condition = tableColumnsToSqlFilterAndPrefix(
            filter ?? [],
            evalDatasetFormFilterCols,
            "dataset_items",
          );

          const items = await prisma.$queryRaw<
            Array<{
              id: string;
              project_id: string;
              dataset_id: string;
              dataset_name: string;
              status: string;
              input: unknown;
              expected_output: unknown;
              metadata: unknown;
              source_trace_id: string | null;
              source_observation_id: string | null;
              created_at: Date;
              updated_at: Date;
            }>
          >`
            SELECT 
              di.id,
              di.project_id,
              di.dataset_id,
              d.name as dataset_name,
              di.status,
              di.input,
              di.expected_output,
              di.metadata,
              di.source_trace_id,
              di.source_observation_id,
              di.created_at,
              di.updated_at
            FROM dataset_items di 
              JOIN datasets d ON di.dataset_id = d.id AND di.project_id = d.project_id
            WHERE di.project_id = ${projectId}
            AND di.created_at < ${cutoffCreatedAt}
            ${condition}
            ORDER BY di.created_at DESC
            LIMIT ${pageSize}
            OFFSET ${offset}
          `;

          return items.map((item) => ({
            id: item.id,
            projectId: item.project_id,
            datasetId: item.dataset_id,
            datasetName: item.dataset_name,
            status: item.status,
            input: item.input,
            expectedOutput: item.expected_output,
            metadata: item.metadata,
            htmlSourcePath: item.source_trace_id
              ? `/project/${projectId}/traces/${item.source_trace_id}${
                  item.source_observation_id
                    ? `?observation=${item.source_observation_id}`
                    : ""
                }`
              : "",
            sourceTraceId: item.source_trace_id,
            sourceObservationId: item.source_observation_id,
            createdAt: item.created_at,
            updatedAt: item.updated_at,
          }));
        },
        env.BATCH_EXPORT_PAGE_SIZE,
        rowLimit,
      );
    }

    case "audit_logs": {
      return new DatabaseReadStream<unknown>(
        async (pageSize: number, offset: number) => {
          const auditLogs = await prisma.auditLog.findMany({
            where: {
              projectId: projectId,
              createdAt: {
                lt: cutoffCreatedAt,
              },
            },
            orderBy: {
              createdAt: "desc",
            },
            skip: offset,
            take: pageSize,
          });

          return auditLogs.map((log) => ({
            id: log.id,
            createdAt: log.createdAt,
            updatedAt: log.updatedAt,
            type: log.type,
            apiKeyId: log.apiKeyId,
            userId: log.userId,
            orgId: log.orgId,
            userOrgRole: log.userOrgRole,
            projectId: log.projectId,
            userProjectRole: log.userProjectRole,
            resourceType: log.resourceType,
            resourceId: log.resourceId,
            action: log.action,
            before: log.before,
            after: log.after,
          }));
        },
        env.BATCH_EXPORT_PAGE_SIZE,
        rowLimit,
      );
    }
    default:
      throw new Error(`Unhandled table case: ${tableName}`);
  }
};

export function prepareScoresForOutput(
  scores: {
    name: string;
    stringValue: string | null;
    dataType: ScoreDataType;
    value: number | null;
  }[],
): Record<string, string[] | number[]> {
  return scores.reduce(
    (acc, score) => {
      // If this score name already exists in acc, use its existing type
      const existingValues = acc[score.name];
      const newValue =
        score.dataType === "NUMERIC" || score.dataType === "BOOLEAN"
          ? score.value
          : score.stringValue;
      if (!isPresent(newValue)) return acc;

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

export type TraceIdentifiers = {
  id: string;
  projectId: string;
  timestamp: Date;
};

export const getTraceIdentifierStream = async (props: {
  projectId: string;
  cutoffCreatedAt: Date;
  filter: FilterCondition[];
  orderBy: OrderByState;
  searchQuery?: string;
  searchType?: TracingSearchType[];
  rowLimit?: number;
}): Promise<DatabaseReadStream<Array<TraceIdentifiers>>> => {
  const {
    projectId,
    cutoffCreatedAt,
    filter,
    orderBy,
    searchQuery,
    searchType,
    rowLimit,
  } = props;

  const createdAtCutoffFilter: FilterCondition = {
    column: "timestamp",
    operator: "<",
    value: cutoffCreatedAt,
    type: "datetime",
  };

  const clickhouseConfigs = {
    request_timeout: 120_000,
  };

  return new DatabaseReadStream<TraceIdentifiers>(
    async (pageSize: number, offset: number) => {
      const identifiers = await getTraceIdentifiers({
        projectId,
        filter: filter
          ? [...filter, createdAtCutoffFilter]
          : [createdAtCutoffFilter],
        searchQuery,
        searchType: searchType ?? ["id" as const],
        orderBy,
        limit: pageSize,
        page: Math.floor(offset / pageSize),
        clickhouseConfigs,
      });
      return identifiers;
    },
    env.BATCH_EXPORT_PAGE_SIZE,
    rowLimit,
  );
};
