import {
  BatchTableNames,
  FilterCondition,
  TimeFilter,
  BatchExportQueryType,
  ScoreDomain,
  evalDatasetFormFilterCols,
  OrderByState,
  TracingSearchType,
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
} from "@langfuse/shared/src/server";
import Decimal from "decimal.js";
import { env } from "../../env";
import { BatchExportTracesRow, BatchExportSessionsRow } from "./types";

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
const isTraceTimestampFilter = (
  filter: FilterCondition,
): filter is TimeFilter => {
  return filter.column === "Timestamp" && filter.type === "datetime";
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

          return scores.map((score) => ({
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
          }));
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

          return getChunkWithFlattenedScores(chunk, emptyScoreColumns);
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

          return getChunkWithFlattenedScores(chunk, emptyScoreColumns);
        },
        env.BATCH_EXPORT_PAGE_SIZE,
        rowLimit,
      );
    }

    case "dataset_run_items": {
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
              dataset_item_id: string;
              trace_id: string;
              observation_id: string | null;
              created_at: Date;
              updated_at: Date;
              dataset_name: string;
            }>
          >`
            SELECT dri.*, d.name as dataset_name

            FROM dataset_run_items dri 
              JOIN dataset_items di ON dri.dataset_item_id = di.id AND dri.project_id = di.project_id 
              JOIN datasets d ON di.dataset_id = d.id AND d.project_id = dri.project_id
            WHERE dri.project_id = ${projectId}
            AND dri.created_at < ${cutoffCreatedAt}
            ${condition}
            ORDER BY dri.created_at DESC
            LIMIT ${pageSize}
            OFFSET ${offset}
          `;

          return items.map((item) => ({
            id: item.id,
            projectId: item.project_id,
            datasetItemId: item.dataset_item_id,
            traceId: item.trace_id,
            observationId: item.observation_id,
            createdAt: item.created_at,
            updatedAt: item.updated_at,
            datasetName: item.dataset_name,
          }));
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
  filteredScores: ScoreDomain[],
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
