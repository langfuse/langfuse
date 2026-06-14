import { Readable } from "stream";
import type {
  EventsObservation,
  MetadataDomain,
  ObservationType,
} from "../../domain";
import { env } from "../../env";
import {
  convertDateToClickhouseDateTime,
  PreferredClickhouseService,
} from "../clickhouse/client";
import {
  getTraceByIdFromTracesTable,
  getTracesIdentifierForSessionFromTracesTable,
  getTracesGroupedByUsers,
  getTotalUserCount,
  getUserMetrics,
  getTracesByIds,
  hasAnyUser,
  getAgentGraphData,
  generateTracesForPublicApi as generateTracesForPublicApiRepo,
  getTracesCountForPublicApi as getTracesCountForPublicApiRepo,
} from "./traces";
import { hasAnySession } from "./trace-sessions";
import { getSessionsWithMetricsGreptime } from "./greptime/sessionsUiTable";
import {
  getEventsGroupedByModelGreptime,
  getEventsGroupedByModelIdGreptime,
  getEventsGroupedByNameGreptime,
  getEventsGroupedByTraceNameGreptime,
  getEventsGroupedByTraceTagsGreptime,
  getEventsGroupedByPromptNameGreptime,
  getEventsGroupedByTypeGreptime,
  getEventsGroupedByUserIdGreptime,
  getEventsGroupedByVersionGreptime,
  getEventsGroupedBySessionIdGreptime,
  getEventsGroupedByLevelGreptime,
  getEventsGroupedByEnvironmentGreptime,
  getEventsGroupedByExperimentDatasetIdGreptime,
  getEventsGroupedByExperimentIdGreptime,
  getEventsGroupedByExperimentNameGreptime,
  getEventsGroupedByHasParentObservationGreptime,
  getEventsGroupedByIsRootObservationGreptime,
  getEventsGroupedByToolNameGreptime,
  getEventsGroupedByCalledToolNameGreptime,
  getEventsNumericStatsByFilterColumnGreptime,
} from "./greptime/eventsGroupedBy";
import {
  getAvgCostByEvaluatorIdsGreptime,
  getObservationsBatchIOFromEventsGreptime,
  getLatestSdkVersionInfoFromEventsGreptime,
  getEventsStreamForEvalGreptime,
} from "./greptime/eventsUtil";
import {
  hasAnyObservation,
  hasAnyObservationOlderThan,
  getTraceIdsForObservations,
} from "./observations";
import {
  getObservationsFromEventsGreptime,
  getObservationsCountFromEventsGreptime,
  getObservationByIdFromEventsGreptime,
  getObservationsForPublicApiFromEventsGreptime,
  getObservationsCountForPublicApiFromEventsGreptime,
  getObservationsV2ForPublicApiFromEventsGreptime,
} from "./greptime/eventsObservations";
import {
  FullEventsObservations,
  createPublicApiTracesColumnMapping,
  deriveFilters,
  ObservationPriceFields,
} from "../queries";
import type {
  EventsTableFilterState,
  FilterCondition,
  FilterState,
} from "../../types";
import type { TracingSearchType } from "../../interfaces/search";
import { tracesTableUiColumnDefinitions } from "../tableMappings/mapTracesTable";
import { DEFAULT_RENDERING_PROPS, RenderingProps } from "../utils/rendering";
import {
  OBSERVATION_FIELD_GROUPS_FULL,
  type ObservationFieldGroupPublicApi,
  type ObservationFieldGroupFull,
} from "../../domain/observation-field-groups";
import { queryClickhouseStream } from "./clickhouse";
import type { AnalyticsObservationEvent } from "../analytics-integrations/types";
import {
  getObservationByIdFromObservationsTable,
  ObservationTableQuery,
} from "./observations";
import {
  EventsQueryBuilder,
  type SessionEventsMetricsRow,
} from "../queries/clickhouse-sql/event-query-builder";
import { type EventsObservationPublic } from "../queries/createGenerationsQuery";
import { type NumericEventsTableColumnId } from "../../eventsTable";
import { tracesTableCols } from "../../tableDefinitions/tracesTable";

type EventBatchIOStringOutput = {
  id: string;
  input: string | null;
  output: string | null;
  metadata: MetadataDomain;
};

type EventBatchIOWithExperimentOutput = EventBatchIOStringOutput & {
  experimentItemExpectedOutput: string | null;
  experimentItemMetadata: MetadataDomain;
};

/**
 * Column mappings for traces aggregated from events table
 */
const PUBLIC_API_TRACES_COLUMN_MAPPING = createPublicApiTracesColumnMapping(
  "traces",
  "t",
);

// TODO: introduce pagination
export const MAX_OBSERVATIONS_PER_TRACE = 10_000;

export const getObservationsForTraceFromEventsTable = async (params: {
  projectId: string;
  traceId: string;
  timestamp?: Date;
  selectIOAndMetadata?: boolean;
  selectToolData?: boolean;
}): Promise<{ observations: FullEventsObservations; totalCount: number }> => {
  const {
    projectId,
    traceId,
    timestamp,
    selectIOAndMetadata = false,
    // selectToolData is ignored: the greptime observations projection always carries the tool
    // columns, so tool counts are computed app-side from the parsed row.
    selectToolData: _selectToolData = false,
  } = params;

  const filter: FilterState = [
    {
      column: "traceId",
      operator: "=" as const,
      value: traceId,
      type: "string" as const,
    },
  ];

  if (timestamp) {
    filter.push({
      column: "startTime",
      operator: ">=" as const,
      // Equivalent to TRACE_TO_OBSERVATIONS_INTERVAL (INTERVAL 1 HOUR)
      value: new Date(timestamp.getTime() - 60 * 60 * 1000),
      type: "datetime" as const,
    });
  }

  const records = await getObservationsFromEventsGreptime({
    projectId,
    filter,
    orderBy: { column: "startTime", order: "ASC" },
    limit: MAX_OBSERVATIONS_PER_TRACE + 1,
    offset: 0,
    selectIOAndMetadata,
  });

  const totalCount = records.length;

  return {
    observations: records.slice(0, MAX_OBSERVATIONS_PER_TRACE),
    totalCount,
  };
};

export const getObservationsCountFromEventsTable = async (
  opts: ObservationTableQuery,
) => {
  return getObservationsCountFromEventsGreptime(opts);
};

export const getObservationsWithModelDataFromEventsTable = async (
  opts: ObservationTableQuery,
): Promise<FullEventsObservations> => {
  return getObservationsFromEventsGreptime(opts);
};

export const getObservationByIdFromEventsTable = async ({
  id,
  projectId,
  fetchWithInputOutput = false,
  startTime,
  type,
  traceId,
  renderingProps = DEFAULT_RENDERING_PROPS,
  preferredClickhouseService: _preferredClickhouseService,
}: {
  id: string;
  projectId: string;
  fetchWithInputOutput?: boolean;
  startTime?: Date;
  type?: ObservationType;
  traceId?: string;
  renderingProps?: RenderingProps;
  preferredClickhouseService?: PreferredClickhouseService;
}) => {
  return getObservationByIdFromEventsGreptime({
    id,
    projectId,
    fetchWithInputOutput,
    startTime,
    type,
    traceId,
    renderingProps,
  });
};

/**
 * Lightweight event stream for batch observation evaluation.
 * Selects the eval field set and maps ClickHouse aliases toward ObservationForEval.
 */
export const getEventsStreamForEval = async (props: {
  projectId: string;
  cutoffCreatedAt?: Date;
  filter: FilterCondition[] | null;
  searchQuery?: string;
  searchType?: TracingSearchType[];
  rowLimit: number;
}): Promise<Readable> => {
  return getEventsStreamForEvalGreptime(props);
};

/**
 * Get a trace by ID from the events table.
 * Compatible with getTraceById but queries the events table instead.
 *
 * Avoid using the `excludeInputOutput` and `excludeMetadata` fields as they
 * are only for backwards compatibility with the existing `getTraceById` interface.
 */
export const getTraceByIdFromEventsTable = async ({
  traceId,
  projectId,
  timestamp,
  fromTimestamp,
  renderingProps = DEFAULT_RENDERING_PROPS,
  // GreptimeDB has a single merged `traces` projection; the events trace read collapses to the same
  // projection read as the legacy path. These CH-only routing hints are ignored.
  clickhouseFeatureTag: _clickhouseFeatureTag = "tracing",
  preferredClickhouseService: _preferredClickhouseService,
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
}) => {
  return getTraceByIdFromTracesTable({
    traceId,
    projectId,
    timestamp,
    fromTimestamp,
    renderingProps,
    excludeInputOutput,
    excludeMetadata,
  });
};

/**
 * Routing wrapper for "trace by id" reads.
 *
 * If data is only written into the events tables, we look there and go to
 * traces otherwise.
 *
 * @deprecated Please prefer `getTraceByIdFromEventsTable` for new use-cases.
 * This should be exclusively used for backwards compatibility if the write mode
 * is events_only.
 */
export const getTraceById = async (
  params: Parameters<typeof getTraceByIdFromTracesTable>[0],
) => {
  if (env.LANGFUSE_MIGRATION_V4_WRITE_MODE !== "events_only") {
    return getTraceByIdFromTracesTable(params);
  }
  return getTraceByIdFromEventsTable(params);
};

/**
 * Routing wrapper for "observation by id" reads.
 *
 * If data is only written into the events tables, we look there and go to the
 * legacy observations table otherwise.
 *
 * @deprecated Please prefer `getObservationByIdFromEventsTable` for new
 * use-cases. This should be exclusively used for backwards compatibility if the
 * write mode is events_only.
 */
export const getObservationById = async (
  params: Parameters<typeof getObservationByIdFromObservationsTable>[0],
) => {
  if (env.LANGFUSE_MIGRATION_V4_WRITE_MODE !== "events_only") {
    return getObservationByIdFromObservationsTable(params);
  }
  return getObservationByIdFromEventsTable(params);
};

/**
 * Routing wrapper for "trace identifiers for session" reads.
 *
 * If data is only written into the events tables, we look there and go to the
 * legacy traces table otherwise.
 *
 * @deprecated Please prefer `getTracesIdentifierForSessionFromEvents` for new
 * use-cases. This should be exclusively used for backwards compatibility if the
 * write mode is events_only.
 */
export const getTracesIdentifierForSession = async (
  projectId: string,
  sessionId: string,
) => {
  if (env.LANGFUSE_MIGRATION_V4_WRITE_MODE !== "events_only") {
    return getTracesIdentifierForSessionFromTracesTable(projectId, sessionId);
  }
  return getTracesIdentifierForSessionFromEvents(projectId, sessionId);
};

type PublicApiObservationsQuery = {
  projectId: string;
  page: number;
  limit: number;
  traceId?: string;
  userId?: string;
  name?: string;
  type?: string;
  level?: string;
  parentObservationId?: string;
  fromStartTime?: string;
  toStartTime?: string;
  version?: string;
  environment?: string | string[];
  advancedFilters?: EventsTableFilterState;
  parseIoAsJson?: boolean;
  cursor?: {
    lastStartTimeTo: Date;
    lastTraceId: string;
    lastId: string;
  };
  fields?: ObservationFieldGroupPublicApi[] | null;
  /**
   * Metadata keys to expand (return full non-truncated values).
   * - null/undefined: use truncated metadata (default behavior)
   * - string[]: expand specified keys (or all keys if empty array)
   */
  expandMetadataKeys?: string[] | null;
};

type BuildObservationsQueryComponentsOptions = {
  allowUnindexedIoFilters?: boolean;
};

/**
 * V1 API: Get observations list from events table for public API
 * Returns complete observations with all fields for transformDbToApiObservation
 */
export const getObservationsFromEventsTableForPublicApi = async (
  opts: Omit<PublicApiObservationsQuery, "fields">,
): Promise<Array<EventsObservation & ObservationPriceFields>> => {
  return getObservationsForPublicApiFromEventsGreptime({
    projectId: opts.projectId,
    props: { ...opts, advancedFilters: opts.advancedFilters as FilterState },
    page: opts.page,
    limit: opts.limit,
    parseIoAsJson: opts.parseIoAsJson,
  });
};

/**
 * V2 API: Get observations list from events table for public API
 * Returns partial observations based on requested field groups
 * Field filtering happens at query time in ClickHouse
 *
 * When IO or expanded metadata is requested, uses a CTE-based split query:
 * - base CTE: filters/orders/limits on events_core (fast, truncated)
 * - io CTE: fetches full IO/metadata from events_full for matched rows only
 * This avoids expensive full-table scans on events_full.
 */
export const getObservationsV2FromEventsTableForPublicApi = async (
  opts: PublicApiObservationsQuery & {
    fields: ObservationFieldGroupPublicApi[];
  },
  // The CH split-query (events_core base + events_full IO CTE) is moot on the single merged
  // GreptimeDB projection; `allowUnindexedIoFilters` is a CH FTS guard with no GreptimeDB analogue.
  _options: BuildObservationsQueryComponentsOptions = {},
): Promise<Array<EventsObservationPublic>> => {
  const requestedFields = opts.fields ?? ["core", "basic"];
  const selectIOAndMetadata =
    requestedFields.includes("io") || requestedFields.includes("metadata");

  return getObservationsV2ForPublicApiFromEventsGreptime({
    projectId: opts.projectId,
    props: { ...opts, advancedFilters: opts.advancedFilters as FilterState },
    limit: opts.limit,
    cursor: opts.cursor,
    selectIOAndMetadata,
    parseIoAsJson: false,
  });
};

/**
 * Get count of observations from events table for public API.
 */
export const getObservationsCountFromEventsTableForPublicApi = async (
  opts: PublicApiObservationsQuery,
): Promise<number> => {
  return getObservationsCountForPublicApiFromEventsGreptime({
    projectId: opts.projectId,
    props: { ...opts, advancedFilters: opts.advancedFilters as FilterState },
  });
};

type PublicApiTracesQuery = {
  projectId: string;
  page: number;
  limit: number;
  userId?: string;
  name?: string;
  tags?: string | string[];
  sessionId?: string;
  version?: string;
  release?: string;
  environment?: string | string[];
  fromTimestamp?: string;
  toTimestamp?: string;
  fields?: string[];
  advancedFilters?: FilterState;
  orderBy?: { column: string; order: "ASC" | "DESC" } | null;
};

/**
 * Get traces list from events table for public API.
 * Aggregates events by trace_id to rebuild traces with observation metrics.
 */
export const getTracesFromEventsTableForPublicApi = async (
  opts: PublicApiTracesQuery,
): Promise<Array<any>> => {
  const filter = deriveFilters(
    opts,
    PUBLIC_API_TRACES_COLUMN_MAPPING,
    opts.advancedFilters,
    tracesTableUiColumnDefinitions,
    tracesTableCols,
  );
  return generateTracesForPublicApiRepo({
    projectId: opts.projectId,
    filter,
    orderBy: opts.orderBy ?? null,
    pagination: { limit: opts.limit, page: opts.page },
    fields: opts.fields as Parameters<
      typeof generateTracesForPublicApiRepo
    >[0]["fields"],
  });
};

/**
 * Get count of traces from events table for public API.
 * Uses same aggregation as list query to ensure consistent filtering.
 */
export const getTracesCountFromEventsTableForPublicApi = async (
  opts: PublicApiTracesQuery,
): Promise<number> => {
  const filter = deriveFilters(
    opts,
    PUBLIC_API_TRACES_COLUMN_MAPPING,
    opts.advancedFilters,
    tracesTableUiColumnDefinitions,
    tracesTableCols,
  );
  const count = await getTracesCountForPublicApiRepo({
    projectId: opts.projectId,
    filter,
    pagination: { limit: opts.limit, page: opts.page },
  });
  return count ?? 0;
};

const _updateableEventKeys = ["bookmarked", "public"] as const;

type UpdateableEventFields = {
  [K in (typeof _updateableEventKeys)[number]]?: boolean;
};

/**
 * Update events in ClickHouse based on selector and updates provided.
 * Selector can filter by spanIds, traceIds, and rootOnly flag.
 * Both spanIds / traceIds are used only when defined and non-empty.
 * E.g. `{ traceIds: [...] }` will only filter by traceIds, while
 * `{ spanIds: [...], traceIds: [...] }` will filter by both.
 *
 * Updates both events_full and events_core tables.
 */
export const updateEvents = async (
  _projectId: string,
  _selector: { spanIds?: string[]; traceIds?: string[]; rootOnly?: boolean },
  _updates: UpdateableEventFields,
): Promise<void> => {
  // No events tables in GreptimeDB; the trace bookmark/public projection is updated via the trace mutation path.
  return;
};

/**
 * Get grouped provided model names from events table
 * Used for filter options
 */
type GroupedEventsFilterOptions = {
  extraWhereRaw?: string;
  limit?: number;
  offset?: number;
  orderBy?: string;
};

export const getEventsGroupedByModel = async (
  projectId: string,
  filter: FilterState,
  opts?: GroupedEventsFilterOptions,
) => {
  return getEventsGroupedByModelGreptime(projectId, filter, {
    limit: opts?.limit,
    offset: opts?.offset,
    orderBy: opts?.orderBy,
  });
};

/**
 * Get grouped model IDs from events table
 * Used for filter options
 */
export const getEventsGroupedByModelId = async (
  projectId: string,
  filter: FilterState,
  opts?: GroupedEventsFilterOptions,
) => {
  return getEventsGroupedByModelIdGreptime(projectId, filter, {
    limit: opts?.limit,
    offset: opts?.offset,
    orderBy: opts?.orderBy,
  });
};

/**
 * Get grouped observation names from events table
 * Used for filter options
 */
export const getEventsGroupedByName = async (
  projectId: string,
  filter: FilterState,
  opts?: GroupedEventsFilterOptions,
) => {
  return getEventsGroupedByNameGreptime(projectId, filter, {
    limit: opts?.limit,
    offset: opts?.offset,
    orderBy: opts?.orderBy,
  });
};

/**
 * Get grouped trace names from events table
 * Used for filter options
 */
export const getEventsGroupedByTraceName = async (
  projectId: string,
  filter: FilterState,
  opts?: GroupedEventsFilterOptions,
) => {
  // opts.extraWhereRaw was a CH raw-SQL escape hatch with no GreptimeDB analogue; intentionally dropped.
  return getEventsGroupedByTraceNameGreptime(projectId, filter, {
    limit: opts?.limit,
    offset: opts?.offset,
    orderBy: opts?.orderBy,
  });
};

/**
 * Get grouped trace tags from events table
 * Used for filter options
 *
 * NOTE:
 * - arrayJoin() explodes arrays into rows, requiring DISTINCT (not GROUP BY)
 * - EventsAggQueryBuilder always emits GROUP BY, which changes semantics
 * - We want unique tag values, not tag occurrence counts
 * We therefore compose a row-level events query via EventsQueryBuilder and
 * run arrayJoin() in an outer CTE query.
 */
export const getEventsGroupedByTraceTags = async (
  projectId: string,
  filter: FilterState,
  // We do not support counts for tags so changing the orderBy does not make sense. Therefore, we omit orderBy from options.
  opts?: Pick<GroupedEventsFilterOptions, "extraWhereRaw" | "limit" | "offset">,
) => {
  // opts.extraWhereRaw was a CH raw-SQL escape hatch with no GreptimeDB analogue; intentionally dropped.
  return getEventsGroupedByTraceTagsGreptime(projectId, filter, {
    limit: opts?.limit,
    offset: opts?.offset,
  });
};

/**
 * Get grouped prompt names from events table
 * Used for filter options
 */
export const getEventsGroupedByPromptName = async (
  projectId: string,
  filter: FilterState,
  opts?: GroupedEventsFilterOptions,
) => {
  return getEventsGroupedByPromptNameGreptime(projectId, filter, {
    limit: opts?.limit,
    offset: opts?.offset,
    orderBy: opts?.orderBy,
  });
};

/**
 * Get grouped observation types from events table
 * Used for filter options
 */
export const getEventsGroupedByType = async (
  projectId: string,
  filter: FilterState,
  opts?: GroupedEventsFilterOptions,
) => {
  return getEventsGroupedByTypeGreptime(projectId, filter, {
    limit: opts?.limit,
    offset: opts?.offset,
    orderBy: opts?.orderBy,
  });
};

/**
 * Get grouped user IDs from events table (joined with traces)
 * Used for filter options
 */
export const getEventsGroupedByUserId = async (
  projectId: string,
  filter: FilterState,
  opts?: GroupedEventsFilterOptions,
) => {
  // opts.extraWhereRaw was a CH raw-SQL escape hatch with no GreptimeDB analogue; intentionally dropped.
  return getEventsGroupedByUserIdGreptime(projectId, filter, {
    limit: opts?.limit,
    offset: opts?.offset,
    orderBy: opts?.orderBy,
  });
};

/**
 * Get grouped versions from events table
 * Used for filter options
 */
export const getEventsGroupedByVersion = async (
  projectId: string,
  filter: FilterState,
  opts?: GroupedEventsFilterOptions,
) => {
  return getEventsGroupedByVersionGreptime(projectId, filter, {
    limit: opts?.limit,
    offset: opts?.offset,
    orderBy: opts?.orderBy,
  });
};

export const getEventsNumericStatsByFilterColumn = async (
  projectId: string,
  filter: FilterState,
  columnId: Exclude<
    NumericEventsTableColumnId,
    "inputTokens" | "outputTokens" | "inputCost" | "outputCost"
  >,
) => {
  return getEventsNumericStatsByFilterColumnGreptime(
    projectId,
    filter,
    columnId,
  );
};

/**
 * Get grouped session IDs from events table (joined with traces)
 * Used for filter options
 */
export const getEventsGroupedBySessionId = async (
  projectId: string,
  filter: FilterState,
  opts?: GroupedEventsFilterOptions,
) => {
  return getEventsGroupedBySessionIdGreptime(projectId, filter, {
    limit: opts?.limit,
    offset: opts?.offset,
    orderBy: opts?.orderBy,
  });
};

/**
 * Get grouped levels from events table
 * Used for filter options
 */
export const getEventsGroupedByLevel = async (
  projectId: string,
  filter: FilterState,
  opts?: GroupedEventsFilterOptions,
) => {
  return getEventsGroupedByLevelGreptime(projectId, filter, {
    limit: opts?.limit,
    offset: opts?.offset,
    orderBy: opts?.orderBy,
  });
};

/**
 * Get grouped environments from events table
 * Used for filter options
 */
export const getEventsGroupedByEnvironment = async (
  projectId: string,
  filter: FilterState,
  opts?: GroupedEventsFilterOptions,
) => {
  return getEventsGroupedByEnvironmentGreptime(projectId, filter, {
    limit: opts?.limit,
    offset: opts?.offset,
    orderBy: opts?.orderBy,
  });
};

/**
 * Get grouped experiment dataset IDs from events table
 * Used for filter options
 */
export const getEventsGroupedByExperimentDatasetId = async (
  projectId: string,
  filter: FilterState,
) => {
  return getEventsGroupedByExperimentDatasetIdGreptime(projectId, filter);
};

/**
 * Get grouped experiment IDs from events table
 * Used for filter options
 */
export const getEventsGroupedByExperimentId = async (
  projectId: string,
  filter: FilterState,
) => {
  return getEventsGroupedByExperimentIdGreptime(projectId, filter);
};

/**
 * Get grouped experiment names from events table
 * Used for filter options
 */
export const getEventsGroupedByExperimentName = async (
  projectId: string,
  filter: FilterState,
) => {
  return getEventsGroupedByExperimentNameGreptime(projectId, filter);
};

/**
 * Get grouped literal parent-pointer boolean from events table.
 */
export const getEventsGroupedByHasParentObservation = async (
  projectId: string,
  filter: FilterState,
  opts?: GroupedEventsFilterOptions,
) => {
  return getEventsGroupedByHasParentObservationGreptime(projectId, filter, {
    limit: opts?.limit,
    offset: opts?.offset,
    orderBy: opts?.orderBy,
  });
};

/**
 * Get grouped root observation boolean from events table.
 * Used for filter options for the "Is Root Observation" facet.
 */
export const getEventsGroupedByIsRootObservation = async (
  projectId: string,
  filter: FilterState,
) => {
  return getEventsGroupedByIsRootObservationGreptime(projectId, filter);
};

/**
 * Get grouped available tool names from events table
 * Used for filter options
 */
export const getEventsGroupedByToolName = async (
  projectId: string,
  filter: FilterState,
) => {
  return getEventsGroupedByToolNameGreptime(projectId, filter);
};

/**
 * Get grouped called tool names from events table
 * Used for filter options
 */
export const getEventsGroupedByCalledToolName = async (
  projectId: string,
  filter: FilterState,
) => {
  return getEventsGroupedByCalledToolNameGreptime(projectId, filter);
};

/**
 * Delete events by trace IDs
 * Used when traces are deleted to cascade the deletion to the events table
 */
export const deleteEventsByTraceIds = async (
  _projectId: string,
  _traceIds: string[],
) => {
  // No events tables in GreptimeDB; projection deletion wired in P1.
  return;
};

export const hasAnyEvent = async (projectId: string) => {
  return hasAnyObservation(projectId);
};

/**
 * Delete all events for a project
 * Used when an entire project is deleted
 */
export const deleteEventsByProjectId = async (
  _projectId: string,
): Promise<boolean> => {
  return false;
};

export async function getAgentGraphDataFromEventsTable(params: {
  projectId: string;
  traceId: string;
  chMinStartTime: string;
  chMaxStartTime: string;
}) {
  // span_id -> observation id; langgraph node/step come from the observation metadata JSON.
  return getAgentGraphData(params);
}

export const hasAnyEventOlderThan = async (
  projectId: string,
  beforeDate: Date,
) => {
  return hasAnyObservationOlderThan(projectId, beforeDate);
};

/**
 * Delete events older than a cutoff date
 * Used for data retention cleanup
 */
export const deleteEventsOlderThanDays = async (
  _projectId: string,
  _beforeDate: Date,
): Promise<boolean> => {
  return false;
};

export const getObservationsBatchIOFromEventsTable = async <
  TIncludeExperiment extends boolean = false,
>(opts: {
  projectId: string;
  observations: Array<{
    id: string;
    traceId: string;
  }>;
  minStartTime: Date;
  maxStartTime: Date;
  truncated?: boolean; // Default true for performance, false for full data
  includeExperimentFields?: TIncludeExperiment;
}): Promise<
  Array<
    TIncludeExperiment extends true
      ? EventBatchIOWithExperimentOutput
      : EventBatchIOStringOutput
  >
> => {
  return getObservationsBatchIOFromEventsGreptime(opts);
};

/**
 * Discouraged: Avoid using this function for new code.
 *
 * This function exists solely to support the annotation queue items lookup,
 * which needs to resolve parent trace IDs for observation-type queue items.
 * It is problematic for performance as it lacks time filtering, requiring
 * ClickHouse to scan a broad range of data.
 * We aim to refactor the annotation queue data model to eliminate this
 * dependency in a future iteration.
 */
export const getObservationsTraceIdsFromEventsTable = async (opts: {
  projectId: string;
  observationIds: string[];
}) => {
  return getTraceIdsForObservations(opts.projectId, opts.observationIds);
};

/**
 * Column mappings for user queries from events table.
 * Includes a "Timestamp" mapping that points to start_time for compatibility
 * with the Users page filter state (which uses "Timestamp" from traces table).
 */
/**
 * Get users with trace counts. Events (v4) collapse onto the GreptimeDB traces projection
 * (04-read-path.md, P3): events_core does not exist on GreptimeDB, and the projection serves the
 * same merged user list as the legacy path.
 */
export const getUsersFromEventsTable = async (
  projectId: string,
  filter: FilterState,
  searchQuery?: string,
  limit?: number,
  offset?: number,
) => {
  return getTracesGroupedByUsers(
    projectId,
    filter,
    searchQuery,
    limit,
    offset,
    undefined,
  );
};

/**
 * Get total user count from events table
 */
export const getUsersCountFromEventsTable = async (
  projectId: string,
  filter: FilterState,
  searchQuery?: string,
) => {
  return getTotalUserCount(projectId, filter, searchQuery);
};

/**
 * Get user metrics from events table
 * Key difference from getUserMetrics in traces.ts:
 * - Uses min(e.start_time)/max(e.start_time) for first/last event (all observations)
 * - Legacy uses min(t.timestamp)/max(t.timestamp) (only trace timestamps)
 */
export const getUserMetricsFromEventsTable = async (
  projectId: string,
  userIds: string[],
  filter: FilterState,
) => {
  if (userIds.length === 0) {
    return [];
  }
  return getUserMetrics(projectId, userIds, filter);
};

/**
 * Check if any user exists in events table
 * Uses hasAnyEvent pattern but filters for user_id
 */
export const hasAnyUserFromEventsTable = async (
  projectId: string,
): Promise<boolean> => {
  return hasAnyUser(projectId);
};

/**
 * Streams events from ClickHouse for blob storage export.
 * Uses EventsQueryBuilder for consistent query construction.
 */
export const getEventsForBlobStorageExport = function (
  projectId: string,
  minTimestamp: Date,
  maxTimestamp: Date,
  fieldGroups: ObservationFieldGroupFull[] = [...OBSERVATION_FIELD_GROUPS_FULL],
) {
  const queryBuilder = new EventsQueryBuilder({ projectId });

  // core is always required (provides id, trace_id, start/end_time used for cursor and deduplication)
  const effectiveGroups = fieldGroups.includes("core")
    ? fieldGroups
    : (["core", ...fieldGroups] as ObservationFieldGroupFull[]);

  for (const group of effectiveGroups) {
    if (group === "io") {
      queryBuilder.selectIO(false); // Full I/O, no truncation
    } else if (group === "model") {
      queryBuilder.selectFieldSet("model_export"); // "model_export" is the SQL field set name for the "model" group
    } else {
      queryBuilder.selectFieldSet(group);
    }
  }

  queryBuilder
    .whereRaw(
      "e.start_time >= {minTimestamp: DateTime64(3)} AND e.start_time <= {maxTimestamp: DateTime64(3)}",
      {
        minTimestamp: convertDateToClickhouseDateTime(minTimestamp),
        maxTimestamp: convertDateToClickhouseDateTime(maxTimestamp),
      },
    )
    .whereRaw("e.is_deleted = 0")
    .limitBy("e.span_id", "e.project_id");

  const { query, params } = queryBuilder.buildWithParams();

  return queryClickhouseStream<Record<string, unknown>>({
    query,
    params,
    tags: {
      feature: "blobstorage",
      type: "event",
      kind: "analytic",
      projectId,
    },
    clickhouseConfigs: {
      request_timeout: env.LANGFUSE_CLICKHOUSE_DATA_EXPORT_REQUEST_TIMEOUT_MS,
    },
    preferredClickhouseService: "EventsReadOnly",
  });
};

/**
 * Streams events from ClickHouse for analytics integrations (PostHog, Mixpanel).
 * Uses EventsQueryBuilder for consistent query construction.
 * All fields come directly from the events table (which has denormalized trace-level data).
 */
export const getEventsForAnalyticsIntegrations = async function* (
  projectId: string,
  projectName: string,
  minTimestamp: Date,
  maxTimestamp: Date,
) {
  const queryBuilder = new EventsQueryBuilder({ projectId })
    // Use export field set for most fields (id, traceId, name, type, level, version,
    // environment, userId, sessionId, tags, release, traceName, totalCost, latency, etc.)
    .selectFieldSet("export")
    // Add analytics-specific computed fields
    .selectRaw(
      // Token counts from usage/cost details
      "e.usage_details['input'] as input_tokens",
      "e.usage_details['output'] as output_tokens",
      "e.usage_details['total'] as total_tokens",
      // Analytics integration session IDs from metadata (constructed from array columns)
      "mapFromArrays(arrayReverse(e.metadata_names), arrayReverse(e.metadata_values))['$posthog_session_id'] as posthog_session_id",
      "mapFromArrays(arrayReverse(e.metadata_names), arrayReverse(e.metadata_values))['$mixpanel_session_id'] as mixpanel_session_id",
    )
    .whereRaw(
      "e.start_time >= {minTimestamp: DateTime64(3)} AND e.start_time < {maxTimestamp: DateTime64(3)}",
      {
        minTimestamp: convertDateToClickhouseDateTime(minTimestamp),
        maxTimestamp: convertDateToClickhouseDateTime(maxTimestamp),
      },
    )
    .whereRaw("e.is_deleted = 0")
    .limitBy("e.span_id", "e.project_id");

  const { query, params } = queryBuilder.buildWithParams();

  const records = queryClickhouseStream<Record<string, unknown>>({
    query,
    params,
    tags: {
      feature: "analytics-integration",
      type: "event",
      kind: "analytic",
      projectId,
    },
    clickhouseConfigs: {
      request_timeout: env.LANGFUSE_CLICKHOUSE_DATA_EXPORT_REQUEST_TIMEOUT_MS,
    },
    preferredClickhouseService: "EventsReadOnly",
  });

  const baseUrl = env.NEXTAUTH_URL?.replace("/api/auth", "");
  for await (const record of records) {
    yield {
      timestamp: record.start_time,
      langfuse_observation_name: record.name,
      langfuse_trace_name: record.trace_name,
      langfuse_trace_id: record.trace_id,
      langfuse_url: `${baseUrl}/project/${projectId}/traces/${encodeURIComponent(record.trace_id as string)}?observation=${encodeURIComponent(record.id as string)}`,
      langfuse_user_url: record.user_id
        ? `${baseUrl}/project/${projectId}/users/${encodeURIComponent(record.user_id as string)}`
        : undefined,
      langfuse_id: record.id,
      langfuse_cost_usd: record.total_cost,
      langfuse_input_units: record.input_tokens,
      langfuse_output_units: record.output_tokens,
      langfuse_total_units: record.total_tokens,
      langfuse_session_id: record.session_id,
      langfuse_project_id: projectId,
      langfuse_project_name: projectName,
      langfuse_user_id: record.user_id || null,
      langfuse_latency: record.latency,
      langfuse_time_to_first_token: record.time_to_first_token,
      langfuse_release: record.release,
      langfuse_version: record.version,
      langfuse_model: record.provided_model_name,
      langfuse_level: record.level,
      langfuse_type: record.type,
      langfuse_tags: record.tags,
      langfuse_environment: record.environment,
      langfuse_event_version: "1.0.0",
      posthog_session_id: record.posthog_session_id ?? null,
      mixpanel_session_id: record.mixpanel_session_id ?? null,
    } satisfies AnalyticsObservationEvent;
  }
};

/*
 * Check if any session exists in events table
 * Filters for non-empty session_id
 */
export const hasAnySessionFromEventsTable = async (
  projectId: string,
): Promise<boolean> => {
  // Session existence is tracked in Postgres (`traceSession`), independent of the analytics store.
  return hasAnySession(projectId);
};

/**
 * Fetch trace metadata (name, user_id, tags) for a list of trace IDs.
 * Used by the scores table to enrich score rows with trace-level data.
 */
export const getTraceMetadataByIdsFromEvents = async (props: {
  projectId: string;
  traceIds: string[];
}): Promise<
  Array<{ id: string; name: string; user_id: string; tags: string[] }>
> => {
  if (props.traceIds.length === 0) return [];
  // Collapse onto the merged traces projection (P3): the score table only needs trace name / user /
  // tags for enrichment, all of which are plain projection columns.
  const traces = await getTracesByIds(props.traceIds, props.projectId);
  return traces.map((t) => ({
    id: t.id,
    name: t.name ?? "",
    user_id: t.userId ?? "",
    tags: t.tags ?? [],
  }));
};

export const getAvgCostByEvaluatorIds = async (
  projectId: string,
  evaluatorIds: string[],
): Promise<
  Array<{ evaluatorId: string; avgCost: number; executionCount: number }>
> => {
  return getAvgCostByEvaluatorIdsGreptime(projectId, evaluatorIds);
};

export const getSessionMetricsFromEvents = async (props: {
  projectId: string;
  sessionIds: string[];
  queryFromTimestamp?: Date;
}): Promise<SessionEventsMetricsRow[]> => {
  if (props.sessionIds.length === 0) return [];

  // Collapse onto the GreptimeDB sessions rollup (P3). sessionIds fully scope the result, so the
  // legacy `queryFromTimestamp` scan-window hint is dropped (it only bounded the CH scan; omitting
  // it widens the scan but cannot change correctness).
  const rows = await getSessionsWithMetricsGreptime({
    projectId: props.projectId,
    filter: [
      {
        column: "id",
        type: "stringOptions",
        operator: "any of",
        value: props.sessionIds,
      },
    ],
  });

  return rows.map((row) => ({
    ...row,
    environment: row.trace_environment,
  }));
};

/**
 * SDK metadata detection result.
 * isOtel is always present, other fields are optional (only when non-empty).
 */
export type SdkMetadata = {
  isOtel: boolean;
  name?: string;
  version?: string;
  language?: string;
};

/**
 * Infers SDK details from the most recent event in the past 7 days containing Langfuse SDK metadata attributes.
 *
 * Detection priority:
 * - v4+: Direct columns (scope_name, scope_version, telemetry_sdk_language)
 * - v3: Nested JSON in metadata (`scope: {name, version}`)
 * - v2 and older: No SDK metadata → returns isOtel: false
 *
 * Returns the most recent matching event's SDK info. Projects with no events
 * in the past 7 days return isOtel: false (acceptable for inactive projects).
 */
export async function getLatestSdkVersionInfoFromEvents(params: {
  projectId: string;
}): Promise<SdkMetadata> {
  return getLatestSdkVersionInfoFromEventsGreptime(params);
}

export const getTracesIdentifierForSessionFromEvents = async (
  projectId: string,
  sessionId: string,
) => {
  // Collapse onto the merged traces projection (P3): same per-session trace identifiers as the
  // legacy path, which `getTracesIdentifierForSessionFromTracesTable` already serves.
  return getTracesIdentifierForSessionFromTracesTable(projectId, sessionId);
};
