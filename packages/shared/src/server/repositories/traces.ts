import {
  commandClickhouse,
  queryClickhouse,
  queryClickhouseStream,
} from "./clickhouse";
import { OrderByState } from "../../interfaces/orderBy";
import { FilterState } from "../../types";
import { FilterList } from "../queries/clickhouse-sql/clickhouse-filter";
import { TraceRecordReadType } from "./definitions";
import { tracesTableUiColumnDefinitions } from "../tableMappings/mapTracesTable";
import { UiColumnMappings, ColumnDefinition } from "../../tableDefinitions";
import {
  convertDateToClickhouseDateTime,
  PreferredClickhouseService,
} from "../clickhouse/client";
import {
  OBSERVATIONS_TO_TRACE_INTERVAL,
  TRACE_TO_OBSERVATIONS_INTERVAL,
} from "./constants";
import { env } from "../../env";
import { ClickHouseClientConfigOptions } from "@clickhouse/client";
import type { AnalyticsTraceEvent } from "../analytics-integrations/types";
import { measureAndReturn } from "../clickhouse/measureAndReturn";
import { DEFAULT_RENDERING_PROPS, RenderingProps } from "../utils/rendering";
import { logger } from "../logger";
import * as greptimeTraceReads from "./greptime/traces";
import { upsertTraceToGreptime } from "./greptime/mutations";

/**
 * Checks if trace exists in clickhouse.
 * Additionally, give back the timestamp of the trace as metadata.
 * Right now, this is only used for the evalService to decide whether a trace needs evaluation.
 * As LLMaaJ allows a reduced set of filters on observations, we exclude some expensive to compute
 * properties from the check. If those become used, we expect their absence to be caught by unit tests.
 *
 * @param {string} projectId - Project ID for the trace
 * @param {string} traceId - ID of the trace to check
 * @param {Date} timestamp - Timestamp for time-based filtering, uses event payload or job timestamp
 * @param {FilterState} filter - Filter for the trace
 * @param {Date} maxTimeStamp - Upper bound on timestamp
 * @param {Date} exactTimestamp - Exact match for the trace
 * @returns {Promise<boolean>} - True if trace exists
 *
 * Notes:
 * • Filters within ±2 day window
 * • Used for validating trace references before eval job creation
 */
export const checkTraceExistsAndGetTimestamp = (args: {
  projectId: string;
  traceId: string;
  timestamp: Date;
  filter: FilterState;
  maxTimeStamp: Date | undefined;
  exactTimestamp?: Date;
}): Promise<{ exists: boolean; timestamp?: Date }> =>
  greptimeTraceReads.checkTraceExistsAndGetTimestamp(args);

export const upsertTrace = async (trace: Partial<TraceRecordReadType>) => {
  if (!["id", "project_id", "timestamp"].every((key) => key in trace)) {
    throw new Error("Identifier fields must be provided to upsert Trace.");
  }

  await upsertTraceToGreptime(trace);
};

export const getTracesByIds = async (
  traceIds: string[],
  projectId: string,
  timestamp?: Date,
  _clickhouseConfigs?: ClickHouseClientConfigOptions | undefined,
) => greptimeTraceReads.getTracesByIds(traceIds, projectId, timestamp);

export const getTracesBySessionId = (
  projectId: string,
  sessionIds: string[],
  timestamp?: Date,
) => greptimeTraceReads.getTracesBySessionId(projectId, sessionIds, timestamp);

export const hasAnyTrace = (projectId: string) =>
  greptimeTraceReads.hasAnyTrace(projectId);

export const getTraceCountsByProjectInCreationInterval = (args: {
  start: Date;
  end: Date;
}) => greptimeTraceReads.getTraceCountsByProjectInCreationInterval(args);

export const getTraceCountOfProjectsSinceCreationDate = (args: {
  projectIds: string[];
  start: Date;
}) => greptimeTraceReads.getTraceCountOfProjectsSinceCreationDate(args);

/**
 * Retrieves a trace record by its ID and associated project ID from the legacy
 * `traces` table.
 *
 * Prefer the routing wrapper `getTraceById` (in repositories/events.ts) for
 * application reads: it dispatches between this legacy reader and the events
 * table based on the V4 migration flags. Call this directly only when you
 * specifically need the legacy table (e.g. backfills, migration tooling).
 */
export const getTraceByIdFromTracesTable = async ({
  traceId,
  projectId,
  timestamp,
  fromTimestamp,
  renderingProps = DEFAULT_RENDERING_PROPS,
  excludeInputOutput = false,
  excludeMetadata = false,
}: {
  traceId: string;
  projectId: string;
  timestamp?: Date;
  fromTimestamp?: Date;
  renderingProps?: RenderingProps;
  clickhouseFeatureTag?: string;
  preferredClickhouseService?: PreferredClickhouseService;
  /** When true, sets input/output columns to empty in the query to reduce database load */
  excludeInputOutput?: boolean;
  /** When true, sets metadata column to empty in the query to reduce database load */
  excludeMetadata?: boolean;
}) =>
  greptimeTraceReads.getTraceByIdFromTracesTable({
    traceId,
    projectId,
    timestamp,
    fromTimestamp,
    renderingProps,
    excludeInputOutput,
    excludeMetadata,
  });

export const getTracesGroupedByName = (
  projectId: string,
  _tableDefinitions: UiColumnMappings = tracesTableUiColumnDefinitions,
  timestampFilter?: FilterState,
) =>
  greptimeTraceReads.getTracesGroupedByName(
    projectId,
    undefined,
    timestampFilter,
  );

export const getTracesGroupedBySessionId = (
  projectId: string,
  filter: FilterState,
  searchQuery?: string,
  limit?: number,
  offset?: number,
  _columns?: UiColumnMappings,
  columnDefinitions?: ColumnDefinition[],
) =>
  greptimeTraceReads.getTracesGroupedBySessionId(
    projectId,
    filter,
    searchQuery,
    limit,
    offset,
    undefined,
    columnDefinitions,
  );

export const getTracesGroupedByUsers = (
  projectId: string,
  filter: FilterState,
  searchQuery?: string,
  limit?: number,
  offset?: number,
  _columns?: UiColumnMappings,
  columnDefinitions?: ColumnDefinition[],
) =>
  greptimeTraceReads.getTracesGroupedByUsers(
    projectId,
    filter,
    searchQuery,
    limit,
    offset,
    undefined,
    columnDefinitions,
  );

export type GroupedTracesQueryProp = {
  projectId: string;
  filter: FilterState;
  columns?: UiColumnMappings;
  columnDefinitions?: ColumnDefinition[];
};

export const getTracesGroupedByTags = (props: GroupedTracesQueryProp) =>
  greptimeTraceReads.getTracesGroupedByTags({
    projectId: props.projectId,
    filter: props.filter,
    columns: undefined,
    columnDefinitions: props.columnDefinitions,
  });

/**
 * Retrieves identifier rows for the traces referencing a session from the
 * legacy `traces` table.
 *
 * Prefer the routing wrapper `getTracesIdentifierForSession` (in
 * repositories/events.ts) for application reads: it dispatches between this
 * legacy reader and the events table based on the V4 migration flags. Call this
 * directly only when you specifically need the legacy table (e.g. backfills,
 * migration tooling).
 */
export const getTracesIdentifierForSessionFromTracesTable = (
  projectId: string,
  sessionId: string,
) =>
  greptimeTraceReads.getTracesIdentifierForSessionFromTracesTable(
    projectId,
    sessionId,
  );

export const deleteTraces = async (projectId: string, traceIds: string[]) => {
  await measureAndReturn({
    operationName: "deleteTraces",
    projectId,
    input: {
      params: {
        projectId,
        traceIds,
      },
      tags: {
        feature: "tracing",
        type: "trace",
        kind: "delete",
        projectId,
      },
    },
    fn: async (input) => {
      // Pre-flight query with time bounds computed
      const preflight = await queryClickhouse<{
        min_ts: string;
        max_ts: string;
        cnt: string;
      }>({
        query: `
          SELECT
            min(timestamp) - INTERVAL 1 HOUR as min_ts,
            max(timestamp) + INTERVAL 1 HOUR as max_ts,
            count(*) as cnt
          FROM traces
          WHERE project_id = {projectId: String} AND id IN ({traceIds: Array(String)})
        `,
        params: input.params,
        clickhouseConfigs: {
          request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
        },
        tags: { ...input.tags, kind: "delete-preflight" },
      });

      const count = Number(preflight[0]?.cnt ?? 0);
      if (count === 0) {
        logger.info(
          `deleteTraces: no rows found for project ${projectId}, skipping DELETE`,
        );
        return;
      }

      await commandClickhouse({
        query: `
          DELETE FROM traces
          WHERE project_id = {projectId: String}
          AND id IN ({traceIds: Array(String)})
          AND timestamp >= {minTs: String}::DateTime64(3)
          AND timestamp <= {maxTs: String}::DateTime64(3)
        `,
        params: {
          ...input.params,
          minTs: preflight[0].min_ts,
          maxTs: preflight[0].max_ts,
        },
        clickhouseConfigs: {
          request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
        },
        tags: input.tags,
      });
    },
  });
};

export const hasAnyTraceOlderThan = (projectId: string, beforeDate: Date) =>
  greptimeTraceReads.hasAnyTraceOlderThan(projectId, beforeDate);

export const deleteTracesOlderThanDays = async (
  projectId: string,
  beforeDate: Date,
): Promise<boolean> => {
  const hasData = await hasAnyTraceOlderThan(projectId, beforeDate);
  if (!hasData) {
    return false;
  }

  await measureAndReturn({
    operationName: "deleteTracesOlderThanDays",
    projectId,
    input: {
      params: {
        projectId,
        cutoffDate: convertDateToClickhouseDateTime(beforeDate),
      },
      tags: {
        feature: "tracing",
        type: "trace",
        kind: "delete",
        projectId,
      },
    },
    fn: async (input) => {
      const query = `
        DELETE FROM traces
        WHERE project_id = {projectId: String}
        AND timestamp < {cutoffDate: DateTime64(3)};
      `;
      await commandClickhouse({
        query: query,
        params: input.params,
        clickhouseConfigs: {
          request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
        },
        tags: input.tags,
      });
    },
  });

  return true;
};

export const deleteTracesByProjectId = async (
  projectId: string,
): Promise<boolean> => {
  const hasData = await hasAnyTrace(projectId);
  if (!hasData) {
    return false;
  }

  await measureAndReturn({
    operationName: "deleteTracesByProjectId",
    projectId,
    input: {
      params: {
        projectId,
      },
      tags: {
        feature: "tracing",
        type: "trace",
        kind: "delete",
        projectId,
      },
    },
    fn: async (input) => {
      const query = `
        DELETE FROM traces
        WHERE project_id = {projectId: String};
      `;

      await commandClickhouse({
        query,
        params: input.params,
        clickhouseConfigs: {
          request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
        },
        tags: input.tags,
      });
    },
  });

  return true;
};

export const hasAnyUser = (projectId: string) =>
  greptimeTraceReads.hasAnyUser(projectId);

export const getTotalUserCount = (
  projectId: string,
  filter: FilterState,
  searchQuery?: string,
): Promise<{ totalCount: bigint }[]> =>
  greptimeTraceReads.getTotalUserCount(projectId, filter, searchQuery);

export const getUserMetrics = (
  projectId: string,
  userIds: string[],
  filter: FilterState,
) => greptimeTraceReads.getUserMetrics(projectId, userIds, filter);

export const getTracesForBlobStorageExport = function (
  projectId: string,
  minTimestamp: Date,
  maxTimestamp: Date,
) {
  const traceTable = "traces";

  const query = `
    SELECT
      id,
      timestamp,
      name,
      environment,
      project_id,
      metadata,
      user_id,
      session_id,
      release,
      version,
      public as public,
      bookmarked as bookmarked,
      tags,
      input as input,
      output as output,
      created_at,
      updated_at
    FROM ${traceTable} FINAL
    WHERE project_id = {projectId: String}
    AND timestamp >= {minTimestamp: DateTime64(3)}
    AND timestamp <= {maxTimestamp: DateTime64(3)}
  `;

  return queryClickhouseStream<Record<string, unknown>>({
    query,
    params: {
      projectId,
      minTimestamp: convertDateToClickhouseDateTime(minTimestamp),
      maxTimestamp: convertDateToClickhouseDateTime(maxTimestamp),
    },
    tags: {
      feature: "blobstorage",
      type: "trace",
      kind: "analytic",
      projectId,
    },
    clickhouseConfigs: {
      request_timeout: env.LANGFUSE_CLICKHOUSE_DATA_EXPORT_REQUEST_TIMEOUT_MS,
    },
  });
};

export const getTracesForAnalyticsIntegrations = async function* (
  projectId: string,
  projectName: string,
  minTimestamp: Date,
  maxTimestamp: Date,
  options: { useGraceHash?: boolean } = {},
) {
  // Determine which trace table to use based on experiment flag
  const traceTable = "traces";

  const query = `
    WITH observations_agg AS (
      SELECT o.project_id,
             o.trace_id,
             sum(total_cost) as total_cost,
             count(*) as observation_count,
             date_diff('millisecond', least(min(start_time), min(end_time)), greatest(max(start_time), max(end_time))) as latency_milliseconds
      FROM observations o FINAL
      WHERE o.project_id = {projectId: String}
      AND o.start_time >= {minTimestamp: DateTime64(3)} - ${TRACE_TO_OBSERVATIONS_INTERVAL}
      AND o.start_time < {maxTimestamp: DateTime64(3)} + ${OBSERVATIONS_TO_TRACE_INTERVAL}
      GROUP BY o.project_id, o.trace_id
    )

    SELECT
      t.id as id,
      t.timestamp as timestamp,
      t.name as name,
      t.session_id as session_id,
      t.user_id as user_id,
      t.release as release,
      t.version as version,
      t.tags as tags,
      t.environment as environment,
      t.metadata['$posthog_session_id'] as posthog_session_id,
      t.metadata['$mixpanel_session_id'] as mixpanel_session_id,
      o.total_cost as total_cost,
      o.latency_milliseconds / 1000 as latency,
      o.observation_count as observation_count
    FROM ${traceTable} t FINAL
    LEFT JOIN observations_agg o ON t.id = o.trace_id AND t.project_id = o.project_id
    WHERE t.project_id = {projectId: String}
    AND t.timestamp >= {minTimestamp: DateTime64(3)}
    AND t.timestamp < {maxTimestamp: DateTime64(3)}
  `;

  const records = queryClickhouseStream<Record<string, unknown>>({
    query,
    params: {
      projectId,
      minTimestamp: convertDateToClickhouseDateTime(minTimestamp),
      maxTimestamp: convertDateToClickhouseDateTime(maxTimestamp),
    },
    tags: {
      feature: "posthog",
      type: "trace",
      kind: "analytic",
      projectId,
    },
    clickhouseConfigs: {
      request_timeout: env.LANGFUSE_CLICKHOUSE_DATA_EXPORT_REQUEST_TIMEOUT_MS,
      ...(options.useGraceHash
        ? {
            clickhouse_settings: {
              join_algorithm: "grace_hash",
              grace_hash_join_initial_buckets: "32",
            },
          }
        : {}),
    },
  });

  const baseUrl = env.NEXTAUTH_URL?.replace("/api/auth", "");

  for await (const record of records) {
    yield {
      timestamp: record.timestamp,
      langfuse_id: record.id,
      langfuse_trace_name: record.name,
      langfuse_url: `${baseUrl}/project/${projectId}/traces/${encodeURIComponent(record.id as string)}`,
      langfuse_user_url: record.user_id
        ? `${baseUrl}/project/${projectId}/users/${encodeURIComponent(record.user_id as string)}`
        : undefined,
      langfuse_cost_usd: record.total_cost,
      langfuse_count_observations: record.observation_count,
      langfuse_session_id: record.session_id,
      langfuse_project_id: projectId,
      langfuse_project_name: projectName,
      langfuse_user_id: record.user_id || null,
      langfuse_latency: record.latency,
      langfuse_release: record.release,
      langfuse_version: record.version,
      langfuse_tags: record.tags,
      langfuse_environment: record.environment,
      langfuse_event_version: "1.0.0",
      posthog_session_id: record.posthog_session_id ?? null,
      mixpanel_session_id: record.mixpanel_session_id ?? null,
    } satisfies AnalyticsTraceEvent;
  }
};

/**
 * This query is used only for legacy support of redirects without a projectId.
 * We don't have an index on the traceId so it will be a full table scan.
 * We expect at most 10s of calls per day, so this is acceptable.
 */
export const getTracesByIdsForAnyProject = (traceIds: string[]) =>
  greptimeTraceReads.getTracesByIdsForAnyProject(traceIds);

export const getAgentGraphData = (params: {
  projectId: string;
  traceId: string;
  chMinStartTime: string;
  chMaxStartTime: string;
}) => greptimeTraceReads.getAgentGraphData(params);

/**
 * Get trace counts grouped by project and day within a date range.
 *
 * Returns one row per project per day with the count of traces created on that day.
 * Uses half-open interval [startDate, endDate) for filtering.
 *
 * @param startDate - Start of date range (inclusive)
 * @param endDate - End of date range (exclusive)
 * @returns Array of { count, projectId, date } objects
 *
 * @example
 * // Get trace counts for March 1-2, 2024
 * const counts = await getTraceCountsByProjectAndDay({
 *   startDate: new Date('2024-03-01T00:00:00Z'),
 *   endDate: new Date('2024-03-03T00:00:00Z')
 * });
 * // Returns: [
 * //   { count: 1500, projectId: 'proj-123', date: '2024-03-01' },
 * //   { count: 1200, projectId: 'proj-123', date: '2024-03-02' },
 * //   { count: 2300, projectId: 'proj-456', date: '2024-03-01' },
 * //   ...
 * // ]
 *
 * Note: Skips using FINAL (double counting risk) for faster and cheaper
 * queries against clickhouse. Generous 4x overcompensation before blocking allows
 * for usage aggregation to be meaningful.
 *
 */
export const getTraceCountsByProjectAndDay = (args: {
  startDate: Date;
  endDate: Date;
}) => greptimeTraceReads.getTraceCountsByProjectAndDay(args);

// ─── TRACE_FIELD_GROUPS (public-API field selection) ─────────────────────────

export const TRACE_FIELD_GROUPS = [
  "core",
  "io",
  "scores",
  "observations",
  "metrics",
] as const;

export type TraceFieldGroup = (typeof TRACE_FIELD_GROUPS)[number];

// ─── Public-API trace query helpers ──────────────────────────────────────────

export type TraceQueryType = {
  page: number;
  limit: number;
  projectId: string;
  traceId?: string;
  userId?: string;
  name?: string;
  type?: string;
  sessionId?: string;
  version?: string;
  release?: string;
  tags?: string | string[];
  environment?: string | string[];
  fromTimestamp?: string;
  toTimestamp?: string;
  fields?: TraceFieldGroup[];
  useEventsTable?: boolean | null;
};

export const generateTracesForPublicApi = (args: {
  projectId: string;
  filter: FilterList;
  orderBy: OrderByState;
  pagination?: { limit: number; page: number };
  fields?: TraceFieldGroup[];
}) => greptimeTraceReads.generateTracesForPublicApi(args);

export const getTracesCountForPublicApi = (args: {
  projectId: string;
  filter: FilterList;
  pagination?: { limit: number; page: number };
}) =>
  greptimeTraceReads.getTracesCountForPublicApi({
    projectId: args.projectId,
    filter: args.filter,
  });
