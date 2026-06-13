import {
  commandClickhouse,
  queryClickhouse,
  queryClickhouseStream,
  upsertClickhouse,
} from "./clickhouse";
import { logger } from "../logger";
import { prisma } from "../../db";
import { ObservationRecordReadType } from "./definitions";
import { FilterState } from "../../types";
import { FilterList, FullObservations } from "../queries";
import { OrderByState } from "../../interfaces/orderBy";
import { getTracesByIds } from "./traces";
import { measureAndReturn } from "../clickhouse/measureAndReturn";
import {
  convertDateToClickhouseDateTime,
  PreferredClickhouseService,
} from "../clickhouse/client";
import {
  convertObservation,
  enrichObservationWithModelData,
} from "./observations_converters";
import {
  OBSERVATIONS_TO_TRACE_INTERVAL,
  TRACE_TO_OBSERVATIONS_INTERVAL,
} from "./constants";
import { env } from "../../env";
import { TracingSearchType } from "../../interfaces/search";
import { ClickHouseClientConfigOptions } from "@clickhouse/client";
import type { AnalyticsGenerationEvent } from "../analytics-integrations/types";
import { ObservationType } from "../../domain";
import {
  LEGACY_OBSERVATION_EXPORT_FIELDS,
  OBSERVATION_FIELD_GROUPS_FULL,
  type ObservationFieldGroupFull,
} from "../../domain/observation-field-groups";
import { DEFAULT_RENDERING_PROPS, RenderingProps } from "../utils/rendering";
import { shouldSkipObservationsFinal } from "../queries/clickhouse-sql/query-options";
import * as greptimeObservationReads from "./greptime/observations";
import {
  getObservationsTableCountGreptime,
  getObservationsTableRowsGreptime,
} from "./greptime/observationsTable";

/**
 * Checks if observation exists in clickhouse.
 *
 * @param {string} projectId - Project ID for the observation
 * @param {string} id - ID of the observation
 * @param {Date} startTime - Timestamp for time-based filtering, uses event payload or job timestamp
 * @returns {Promise<boolean>} - True if observation exists
 *
 * Notes:
 * • Filters with two days lookback window subject to startTime
 * • Used for validating observation references before eval job creation
 */
export const checkObservationExists = (
  projectId: string,
  id: string,
  startTime: Date | undefined,
): Promise<boolean> =>
  greptimeObservationReads.checkObservationExists(projectId, id, startTime);

/**
 * Accepts a trace in a Clickhouse-ready format.
 * id, project_id, and timestamp must always be provided.
 */
export const upsertObservation = async (
  observation: Partial<ObservationRecordReadType>,
) => {
  if (
    !["id", "project_id", "start_time", "type"].every(
      (key) => key in observation,
    )
  ) {
    throw new Error(
      "Identifier fields must be provided to upsert Observation.",
    );
  }
  await upsertClickhouse({
    table: "observations",
    records: [observation as ObservationRecordReadType],
    eventBodyMapper: convertObservation,
    tags: {
      feature: "tracing",
      type: "observation",
      kind: "upsert",
      projectId: observation.project_id ?? "",
    },
  });
};

export type GetObservationsForTraceOpts<IncludeIO extends boolean> = {
  traceId: string;
  projectId: string;
  timestamp?: Date;
  includeIO?: IncludeIO;
  preferredClickhouseService?: PreferredClickhouseService;
};

export const getObservationsForTrace = <IncludeIO extends boolean>(
  opts: GetObservationsForTraceOpts<IncludeIO>,
) =>
  greptimeObservationReads.getObservationsForTrace({
    traceId: opts.traceId,
    projectId: opts.projectId,
    timestamp: opts.timestamp,
    includeIO: opts.includeIO,
  });

export const getObservationForTraceIdByName = (args: {
  traceId: string;
  projectId: string;
  name: string;
  timestamp?: Date;
  fetchWithInputOutput?: boolean;
}) => greptimeObservationReads.getObservationForTraceIdByName(args);

/**
 * Retrieves an observation by its ID from the legacy `observations` table.
 *
 * Prefer the routing wrapper `getObservationById` (in repositories/events.ts)
 * for application reads: it dispatches between this legacy reader and the events
 * table based on the V4 migration flags. Call this directly only when you
 * specifically need the legacy table (e.g. backfills, migration tooling).
 */
export const getObservationByIdFromObservationsTable = ({
  id,
  projectId,
  fetchWithInputOutput = false,
  startTime,
  type,
  traceId,
  renderingProps = DEFAULT_RENDERING_PROPS,
}: {
  id: string;
  projectId: string;
  fetchWithInputOutput?: boolean;
  startTime?: Date;
  type?: ObservationType;
  traceId?: string;
  renderingProps?: RenderingProps;
  preferredClickhouseService?: PreferredClickhouseService;
}) =>
  greptimeObservationReads.getObservationByIdFromObservationsTable({
    id,
    projectId,
    fetchWithInputOutput,
    startTime,
    type,
    traceId,
    renderingProps,
  });

export const getObservationsById = (
  ids: string[],
  projectId: string,
  fetchWithInputOutput: boolean = false,
) =>
  greptimeObservationReads.getObservationsById(
    ids,
    projectId,
    fetchWithInputOutput,
  );

export type ObservationTableQuery = {
  projectId: string;
  filter: FilterState;
  orderBy?: OrderByState;
  searchQuery?: string;
  searchType?: TracingSearchType[];
  limit?: number;
  offset?: number;
  selectIOAndMetadata?: boolean;
  renderingProps?: RenderingProps;
  clickhouseConfigs?: ClickHouseClientConfigOptions | undefined;
};

export type ObservationsTableQueryResult = ObservationRecordReadType & {
  latency?: string;
  time_to_first_token?: string;
  trace_tags?: string[];
  trace_name?: string;
  trace_user_id?: string;
  // Tool counts for list view performance (ClickHouse numbers as strings)
  tool_definitions_count?: string;
  tool_calls_count?: string;
};

export const getObservationsTableCount = async (
  opts: ObservationTableQuery,
): Promise<number> => {
  return getObservationsTableCountGreptime(opts);
};

export const getObservationsTableWithModelData = async (
  opts: ObservationTableQuery,
): Promise<FullObservations> => {
  const observations = await getObservationsTableRowsGreptime(
    opts,
    opts.renderingProps ?? DEFAULT_RENDERING_PROPS,
  );

  const uniqueModels: string[] = Array.from(
    new Set(
      observations
        .map((o) => o.internalModelId)
        .filter((m): m is string => Boolean(m)),
    ),
  );

  const [models, traces] = await Promise.all([
    uniqueModels.length > 0
      ? prisma.model.findMany({
          where: {
            id: { in: uniqueModels },
            OR: [{ projectId: opts.projectId }, { projectId: null }],
          },
          include: { Price: true },
        })
      : [],
    getTracesByIds(
      observations.map((o) => o.traceId).filter((t): t is string => Boolean(t)),
      opts.projectId,
    ),
  ]);

  return observations.map((o) => {
    const trace = traces.find((t) => t.id === o.traceId);
    const model = models.find((m) => m.id === o.internalModelId);
    return {
      ...o,
      traceName: trace?.name ?? null,
      traceTags: trace?.tags ?? [],
      traceTimestamp: trace?.timestamp ?? null,
      userId: trace?.userId ?? null,
      toolDefinitionsCount: o.toolDefinitions
        ? Object.keys(o.toolDefinitions).length
        : null,
      toolCallsCount: o.toolCalls ? o.toolCalls.length : null,
      ...enrichObservationWithModelData(model),
    };
  });
};

export const getObservationsGroupedByModel = (
  projectId: string,
  filter: FilterState,
) => greptimeObservationReads.getObservationsGroupedByModel(projectId, filter);

export const getObservationsGroupedByModelId = (
  projectId: string,
  filter: FilterState,
) =>
  greptimeObservationReads.getObservationsGroupedByModelId(projectId, filter);

export const getObservationsGroupedByName = (
  projectId: string,
  filter: FilterState,
  type: ObservationType | null = "GENERATION",
) =>
  greptimeObservationReads.getObservationsGroupedByName(
    projectId,
    filter,
    type,
  );

export const getObservationsGroupedByToolName = (
  projectId: string,
  filter: FilterState,
) =>
  greptimeObservationReads.getObservationsGroupedByToolName(projectId, filter);

export const getObservationsGroupedByCalledToolName = (
  projectId: string,
  filter: FilterState,
) =>
  greptimeObservationReads.getObservationsGroupedByCalledToolName(
    projectId,
    filter,
  );

export const getObservationsGroupedByPromptName = (
  projectId: string,
  filter: FilterState,
) =>
  greptimeObservationReads.getObservationsGroupedByPromptName(
    projectId,
    filter,
  );

export const getCostForTraces = (
  projectId: string,
  timestamp: Date,
  traceIds: string[],
) => greptimeObservationReads.getCostForTraces(projectId, timestamp, traceIds);

export const deleteObservationsByTraceIds = async (
  projectId: string,
  traceIds: string[],
) => {
  const preflight = await queryClickhouse<{
    min_ts: string;
    max_ts: string;
    cnt: string;
  }>({
    query: `
      SELECT
        min(start_time) - INTERVAL 1 HOUR as min_ts,
        max(start_time) + INTERVAL 1 HOUR as max_ts,
        count(*) as cnt
      FROM observations
      WHERE project_id = {projectId: String} AND trace_id IN ({traceIds: Array(String)})
    `,
    params: { projectId, traceIds },
    clickhouseConfigs: {
      request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
    },
    tags: {
      feature: "tracing",
      type: "observation",
      kind: "delete-preflight",
      projectId,
    },
  });

  const count = Number(preflight[0]?.cnt ?? 0);
  if (count === 0) {
    logger.info(
      `deleteObservationsByTraceIds: no rows found for project ${projectId}, skipping DELETE`,
    );
    return;
  }

  await commandClickhouse({
    query: `
      DELETE FROM observations
      WHERE project_id = {projectId: String}
      AND trace_id IN ({traceIds: Array(String)})
      AND start_time >= {minTs: String}::DateTime64(3)
      AND start_time <= {maxTs: String}::DateTime64(3)
    `,
    params: {
      projectId,
      traceIds,
      minTs: preflight[0].min_ts,
      maxTs: preflight[0].max_ts,
    },
    clickhouseConfigs: {
      request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
    },
    tags: {
      feature: "tracing",
      type: "observation",
      kind: "delete",
      projectId,
    },
  });
};

export const hasAnyObservation = (projectId: string) =>
  greptimeObservationReads.hasAnyObservation(projectId);

export const deleteObservationsByProjectId = async (
  projectId: string,
): Promise<boolean> => {
  const hasData = await hasAnyObservation(projectId);
  if (!hasData) {
    return false;
  }

  const query = `
    DELETE FROM observations
    WHERE project_id = {projectId: String};
  `;
  const tags = {
    feature: "tracing",
    type: "observation",
    kind: "delete",
    projectId,
  };

  await commandClickhouse({
    query,
    params: { projectId },
    clickhouseConfigs: {
      request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
    },
    tags,
  });

  return true;
};

export const hasAnyObservationOlderThan = async (
  projectId: string,
  beforeDate: Date,
) => greptimeObservationReads.hasAnyObservationOlderThan(projectId, beforeDate);

export const deleteObservationsOlderThanDays = async (
  projectId: string,
  beforeDate: Date,
): Promise<boolean> => {
  const hasData = await hasAnyObservationOlderThan(projectId, beforeDate);
  if (!hasData) {
    return false;
  }

  const query = `
    DELETE FROM observations
    WHERE project_id = {projectId: String}
    AND start_time < {cutoffDate: DateTime64(3)};
  `;
  await commandClickhouse({
    query: query,
    params: {
      projectId,
      cutoffDate: convertDateToClickhouseDateTime(beforeDate),
    },
    clickhouseConfigs: {
      request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
    },
    tags: {
      feature: "tracing",
      type: "observation",
      kind: "delete",
      projectId,
    },
  });

  return true;
};

export const getObservationsWithPromptName = (
  projectId: string,
  promptNames: string[],
  opts: { fromTimestamp?: Date; toTimestamp?: Date } = {},
) =>
  greptimeObservationReads.getObservationsWithPromptName(
    projectId,
    promptNames,
    opts,
  );

export const getObservationMetricsForPrompts = (
  projectId: string,
  promptIds: string[],
  opts: { fromTimestamp?: Date; toTimestamp?: Date } = {},
) =>
  greptimeObservationReads.getObservationMetricsForPrompts(
    projectId,
    promptIds,
    opts,
  );

export const getLatencyAndTotalCostForObservations = (
  projectId: string,
  observationIds: string[],
  timestamp?: Date,
) =>
  greptimeObservationReads.getLatencyAndTotalCostForObservations(
    projectId,
    observationIds,
    timestamp,
  );

export const getLatencyAndTotalCostForObservationsByTraces = (
  projectId: string,
  traceIds: string[],
  timestamp?: Date,
) =>
  greptimeObservationReads.getLatencyAndTotalCostForObservationsByTraces(
    projectId,
    traceIds,
    timestamp,
  );

/**
 * Tuple type for observation data from ClickHouse groupArray
 */
export type ObservationTuple = [
  id: string,
  parentObservationId: string | null,
  totalCost: string,
  inputCost: string,
  outputCost: string,
  latencyMs: number,
];

/**
 * Get observations grouped by trace ID with cost and latency data
 *
 * This is a pure data-fetching function that returns observations organized by trace.
 * For business logic like recursive cost calculations, use the utility functions
 * in the utils layer.
 */
export const getObservationsGroupedByTraceId = (
  projectId: string,
  traceIds: string[],
  timestamp?: Date,
): Promise<Map<string, ObservationTuple[]>> =>
  greptimeObservationReads.getObservationsGroupedByTraceId(
    projectId,
    traceIds,
    timestamp,
  ) as Promise<Map<string, ObservationTuple[]>>;

export const getObservationCountsByProjectInCreationInterval = (args: {
  start: Date;
  end: Date;
}) =>
  greptimeObservationReads.getObservationCountsByProjectInCreationInterval(
    args,
  );

export const getObservationCountOfProjectsSinceCreationDate = (args: {
  projectIds: string[];
  start: Date;
}) =>
  greptimeObservationReads.getObservationCountOfProjectsSinceCreationDate(args);

export const getTraceIdsForObservations = (
  projectId: string,
  observationIds: string[],
) =>
  greptimeObservationReads.getTraceIdsForObservations(
    projectId,
    observationIds,
  );

// SQL expressions for the export fields of LEGACY_OBSERVATION_EXPORT_FIELDS
// (the domain-level export contract) that are not plain column reads. Every
// other field selects the table column of the same name.
const LEGACY_OBSERVATION_EXPORT_SQL_OVERRIDES: Record<string, string> = {
  latency:
    "if(isNull(end_time), NULL, date_diff('millisecond', start_time, end_time) / 1000) as latency",
  time_to_first_token:
    "if(isNull(completion_start_time), NULL, date_diff('millisecond', start_time, completion_start_time) / 1000) as time_to_first_token",
  model_id: "internal_model_id as model_id",
};

export const getObservationsForBlobStorageExport = function (
  projectId: string,
  minTimestamp: Date,
  maxTimestamp: Date,
  fieldGroups: ObservationFieldGroupFull[] = [...OBSERVATION_FIELD_GROUPS_FULL],
) {
  // core is always required (provides id, trace_id, start/end_time used for deduplication)
  const effectiveGroups = new Set<ObservationFieldGroupFull>([
    "core",
    ...fieldGroups,
  ]);

  const selectedColumns = LEGACY_OBSERVATION_EXPORT_FIELDS.filter((column) =>
    effectiveGroups.has(column.group),
  ).map(
    (column) =>
      LEGACY_OBSERVATION_EXPORT_SQL_OVERRIDES[column.field] ?? column.field,
  );

  const query = `
    SELECT
      ${selectedColumns.join(",\n      ")}
    FROM observations
    WHERE project_id = {projectId: String}
    AND start_time >= {minTimestamp: DateTime64(3)}
    AND start_time <= {maxTimestamp: DateTime64(3)}
    ORDER BY event_ts DESC
    LIMIT 1 BY id, project_id, type
  `;

  const records = queryClickhouseStream<Record<string, unknown>>({
    query,
    params: {
      projectId,
      minTimestamp: convertDateToClickhouseDateTime(minTimestamp),
      maxTimestamp: convertDateToClickhouseDateTime(maxTimestamp),
    },
    tags: {
      feature: "blobstorage",
      type: "observation",
      kind: "analytic",
      projectId,
    },
    clickhouseConfigs: {
      request_timeout: env.LANGFUSE_CLICKHOUSE_DATA_EXPORT_REQUEST_TIMEOUT_MS,
    },
    preferredClickhouseService: "ReadOnly",
  });

  return records;
};

export const getGenerationsForAnalyticsIntegrations = async function* (
  projectId: string,
  projectName: string,
  minTimestamp: Date,
  maxTimestamp: Date,
  options: { useGraceHash?: boolean } = {},
) {
  // Pre-filter traces in a CTE so the trace timestamp window prunes partitions
  // directly, instead of living alongside the LEFT JOIN where the planner
  // cannot push it down. LEFT JOIN keeps generations whose trace is missing or
  // outside the 7-day window — they still ship to PostHog with NULL trace
  // fields rather than being silently dropped.
  const query = `
    WITH selected_traces AS (
      SELECT
        t.project_id as project_id,
        t.id as id,
        t.name as name,
        t.session_id as session_id,
        t.user_id as user_id,
        t.release as release,
        t.tags as tags,
        t.metadata['$posthog_session_id'] as posthog_session_id,
        t.metadata['$mixpanel_session_id'] as mixpanel_session_id
      FROM traces t FINAL
      WHERE t.project_id = {projectId: String}
      AND t.timestamp >= {minTimestamp: DateTime64(3)} - ${OBSERVATIONS_TO_TRACE_INTERVAL}
      AND t.timestamp <= {maxTimestamp: DateTime64(3)} + ${TRACE_TO_OBSERVATIONS_INTERVAL}
    )

    SELECT
      o.name as name,
      o.start_time as start_time,
      o.id as id,
      o.total_cost as total_cost,
      if(isNull(completion_start_time), NULL, date_diff('millisecond', start_time, completion_start_time)) as time_to_first_token,
      o.usage_details['total'] as input_tokens,
      o.usage_details['output'] as output_tokens,
      o.cost_details['total'] as total_tokens,
      o.project_id as project_id,
      if(isNull(end_time), NULL, date_diff('millisecond', start_time, end_time) / 1000) as latency,
      o.provided_model_name as model,
      o.level as level,
      o.version as version,
      o.environment as environment,
      t.id as trace_id,
      t.name as trace_name,
      t.session_id as trace_session_id,
      t.user_id as trace_user_id,
      t.release as trace_release,
      t.tags as trace_tags,
      t.posthog_session_id as posthog_session_id,
      t.mixpanel_session_id as mixpanel_session_id
    FROM observations o FINAL
    LEFT JOIN selected_traces t ON o.trace_id = t.id AND o.project_id = t.project_id
    WHERE o.project_id = {projectId: String}
    AND o.start_time >= {minTimestamp: DateTime64(3)}
    AND o.start_time < {maxTimestamp: DateTime64(3)}
    AND o.type = 'GENERATION'
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
      type: "observation",
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
      timestamp: record.start_time,
      langfuse_generation_name: record.name,
      langfuse_trace_name: record.trace_name,
      langfuse_trace_id: record.trace_id,
      langfuse_url: `${baseUrl}/project/${projectId}/traces/${encodeURIComponent(record.trace_id as string)}?observation=${encodeURIComponent(record.id as string)}`,
      langfuse_user_url: record.trace_user_id
        ? `${baseUrl}/project/${projectId}/users/${encodeURIComponent(record.trace_user_id as string)}`
        : undefined,
      langfuse_id: record.id,
      langfuse_cost_usd: record.total_cost,
      langfuse_input_units: record.input_tokens,
      langfuse_output_units: record.output_tokens,
      langfuse_total_units: record.total_tokens,
      langfuse_session_id: record.trace_session_id,
      langfuse_project_id: projectId,
      langfuse_project_name: projectName,
      langfuse_user_id: record.trace_user_id || null,
      langfuse_latency: record.latency,
      langfuse_time_to_first_token: record.time_to_first_token,
      langfuse_release: record.trace_release,
      langfuse_version: record.version,
      langfuse_model: record.model,
      langfuse_level: record.level,
      langfuse_tags: record.trace_tags,
      langfuse_environment: record.environment,
      langfuse_event_version: "1.0.0",
      posthog_session_id: record.posthog_session_id ?? null,
      mixpanel_session_id: record.mixpanel_session_id ?? null,
    } satisfies AnalyticsGenerationEvent;
  }
};

/**
 * Get observation counts grouped by project and day within a date range.
 *
 * Returns one row per project per day with the count of observations started on that day.
 * Uses half-open interval [startDate, endDate) for filtering based on start_time.
 *
 * @param startDate - Start of date range (inclusive)
 * @param endDate - End of date range (exclusive)
 * @returns Array of { count, projectId, date } objects
 *
 * @example
 * // Get observation counts for March 1-2, 2024
 * const counts = await getObservationCountsByProjectAndDay({
 *   startDate: new Date('2024-03-01T00:00:00Z'),
 *   endDate: new Date('2024-03-03T00:00:00Z')
 * });
 *
 * Note: Skips using FINAL (double counting risk) for faster and cheaper
 * queries against clickhouse. Generous 4x overcompensation before blocking allows
 * for usage aggregation to be meaningful.
 */
export const getObservationCountsByProjectAndDay = (args: {
  startDate: Date;
  endDate: Date;
}) => greptimeObservationReads.getObservationCountsByProjectAndDay(args);

/**
 * Get total cost grouped by evaluator ID (job_configuration_id) for the last week.
 *
 * @param projectId - Project ID
 * @param evaluatorIds - Array of evaluator IDs (job_configuration_id from metadata)
 * @returns Array of { evaluatorId, totalCost } objects
 */
export const getCostByEvaluatorIds = (
  projectId: string,
  evaluatorIds: string[],
): Promise<Array<{ evaluatorId: string; totalCost: number }>> =>
  greptimeObservationReads.getCostByEvaluatorIds(projectId, evaluatorIds);

// ─── Public-API observation query helpers ─────────────────────────────────────

export const generateObservationsForPublicApi = async ({
  projectId,
  filter,
  pagination,
}: {
  projectId: string;
  filter: FilterList;
  pagination: { limit: number; page: number };
}) => {
  const appliedFilter = filter.apply();
  const traceFilter = filter.find((f) => f.clickhouseTable === "traces");

  const disableObservationsFinal = await shouldSkipObservationsFinal(projectId);

  const query = `
    with clickhouse_keys as (
      SELECT DISTINCT
        id,
        trace_id,
        project_id,
        type,
        toDate(start_time)
      FROM observations o
        ${traceFilter ? `LEFT JOIN __TRACE_TABLE__ t ON o.trace_id = t.id AND t.project_id = o.project_id` : ""}
      WHERE o.project_id = {projectId: String}
        ${traceFilter ? `AND t.project_id = {projectId: String}` : ""}
        AND ${appliedFilter.query}
      ORDER BY start_time DESC
        LIMIT {limit: Int32} OFFSET {offset: Int32}
    )
    SELECT
      id,
      trace_id,
      project_id,
      type,
      parent_observation_id,
      environment,
      start_time,
      end_time,
      name,
      metadata,
      level,
      status_message,
      version,
      input,
      output,
      provided_model_name,
      internal_model_id,
      model_parameters,
      provided_usage_details,
      usage_details,
      provided_cost_details,
      cost_details,
      total_cost,
      completion_start_time,
      prompt_id,
      prompt_name,
      prompt_version,
      created_at,
      updated_at,
      event_ts
    FROM observations o ${disableObservationsFinal ? "" : "FINAL"}
    WHERE o.project_id = {projectId: String}
      AND (id, trace_id, project_id, type, toDate(start_time)) in (select * from clickhouse_keys)
    ORDER BY start_time DESC
  `;

  return measureAndReturn({
    operationName: "generateObservationsForPublicApi",
    projectId,
    input: {
      params: {
        ...appliedFilter.params,
        projectId,
        limit: pagination.limit,
        offset: (pagination.page - 1) * pagination.limit,
      },
      tags: {
        feature: "tracing",
        type: "observation",
        projectId,
        operation_name: "generateObservationsForPublicApi",
      },
    },
    fn: async (input) => {
      const result = await queryClickhouse<ObservationRecordReadType>({
        query: query.replace("__TRACE_TABLE__", "traces"),
        params: input.params,
        tags: input.tags,
        preferredClickhouseService: "ReadOnly",
      });
      return result.map((r) => convertObservation(r));
    },
  });
};

export const getObservationsCountForPublicApi = async ({
  projectId,
  filter,
}: {
  projectId: string;
  filter: FilterList;
}) => {
  const appliedFilter = filter.apply();
  const traceFilter = filter.find((f) => f.clickhouseTable === "traces");

  const query = `
    SELECT count() as count
    FROM observations o
    ${traceFilter ? `LEFT JOIN __TRACE_TABLE__ t ON o.trace_id = t.id AND t.project_id = o.project_id` : ""}
    WHERE o.project_id = {projectId: String}
    ${traceFilter ? `AND t.project_id = {projectId: String}` : ""}
    AND ${appliedFilter.query}
  `;

  return measureAndReturn({
    operationName: "getObservationsCountForPublicApi",
    projectId,
    input: {
      params: { ...appliedFilter.params, projectId },
      tags: {
        feature: "tracing",
        type: "observation",
        projectId,
        operation_name: "getObservationsCountForPublicApi",
      },
    },
    fn: async (input) => {
      const records = await queryClickhouse<{ count: string }>({
        query: query.replace("__TRACE_TABLE__", "traces"),
        params: input.params,
        tags: input.tags,
        preferredClickhouseService: "ReadOnly",
      });
      return records.map((record) => Number(record.count)).shift();
    },
  });
};
