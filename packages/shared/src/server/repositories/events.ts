import { prisma } from "../../db";
import { Observation, EventsObservation, ObservationType } from "../../domain";
import { env } from "../../env";
import { InternalServerError, LangfuseNotFoundError } from "../../errors";
import {
  convertDateToClickhouseDateTime,
  PreferredClickhouseService,
} from "../clickhouse/client";
import { measureAndReturn } from "../clickhouse/measureAndReturn";
import { recordDistribution } from "../instrumentation";
import { logger } from "../logger";
import {
  convertClickhouseToDomain,
  convertClickhouseTracesListToDomain,
} from "./traces_converters";
import {
  DateTimeFilter,
  FilterList,
  FullEventsObservations,
  orderByToClickhouseSql,
  orderByToEntries,
  createPublicApiObservationsColumnMapping,
  createPublicApiTracesColumnMapping,
  deriveFilters,
  type ApiColumnMapping,
  ObservationPriceFields,
} from "../queries";
import { createFilterFromFilterState } from "../queries/clickhouse-sql/factory";
import type { FilterState } from "../../types";
import {
  eventsScoresAggregation,
  eventsSessionsAggregation,
  eventsTraceMetadata,
  eventsTracesAggregation,
  eventsTracesScoresAggregation,
} from "../queries/clickhouse-sql/query-fragments";
import { clickhouseSearchCondition } from "../queries/clickhouse-sql/search";
import {
  eventsTableNativeUiColumnDefinitions,
  eventsTableUiColumnDefinitions,
} from "../tableMappings/mapEventsTable";
import { tracesTableUiColumnDefinitions } from "../tableMappings/mapTracesTable";
import {
  applyInputOutputRendering,
  DEFAULT_RENDERING_PROPS,
  RenderingProps,
} from "../utils/rendering";
import {
  commandClickhouse,
  parseClickhouseUTCDateTimeFormat,
  queryClickhouse,
  queryClickhouseStream,
} from "./clickhouse";
import { ObservationRecordReadType, TraceRecordReadType } from "./definitions";
import type { AnalyticsObservationEvent } from "../analytics-integrations/types";
import {
  ObservationsTableQueryResult,
  ObservationTableQuery,
} from "./observations";
import {
  convertEventsObservation,
  convertObservation,
} from "./observations_converters";
import {
  EventsQueryBuilder,
  CTEQueryBuilder,
  EventsAggQueryBuilder,
  buildEventsFullTableSplitQuery,
  type QueryWithParams,
  type SessionEventsMetricsRow,
  OrderByEntry,
} from "../queries/clickhouse-sql/event-query-builder";
import { type EventsObservationPublic } from "../queries/createGenerationsQuery";
import { UiColumnMappings } from "../../tableDefinitions";
import { parseMetadataCHRecordToDomain } from "../utils/metadata_conversion";

/**
 * Attempt to command the legacy events table.
 * Skips if env toggle is off; swallows errors if the table no longer exists.
 */
async function commandLegacyEventsTable(
  opts: Parameters<typeof commandClickhouse>[0],
): Promise<void> {
  if (env.LANGFUSE_LEGACY_EVENTS_TABLE_EXISTS !== "true") return;
  try {
    await commandClickhouse(opts);
  } catch (e) {
    logger.warn("Legacy events table command failed (table may not exist)", e);
  }
}

type ObservationsTableQueryResultWitouhtTraceFields = Omit<
  ObservationsTableQueryResult,
  "trace_tags" | "trace_name" | "trace_user_id"
>;

/**
 * Internal helper: enrich observations with model pricing data
 * Uses events-specific converter to include userId and sessionId
 * Supports both V1 (complete observations) and V2 (partial observations with field groups)
 *
 * @param observationRecords - Raw observation records from ClickHouse
 * @param projectId - Project ID for model lookup
 * @param parseIoAsJson - Whether to parse input/output as JSON
 * @param requestedFields - Field groups for V2 API (null = V1 API, returns complete observations)
 */
async function enrichObservationsWithModelData(
  observationRecords: Array<ObservationsTableQueryResultWitouhtTraceFields>,
  projectId: string,
  parseIoAsJson: boolean,
  requestedFields: ObservationFieldGroup[],
): Promise<Array<EventsObservationPublic>>;
async function enrichObservationsWithModelData(
  observationRecords: Array<ObservationsTableQueryResultWitouhtTraceFields>,
  projectId: string,
  parseIoAsJson: boolean,
  requestedFields: null,
): Promise<Array<EventsObservation & ObservationPriceFields>>;
async function enrichObservationsWithModelData(
  observationRecords: Array<ObservationsTableQueryResultWitouhtTraceFields>,
  projectId: string,
  parseIoAsJson: boolean,
  requestedFields: ObservationFieldGroup[] | null,
): Promise<
  Array<(EventsObservation & ObservationPriceFields) | EventsObservationPublic>
> {
  // Determine if this is V1 (complete) or V2 (partial) API
  const isV2 = Array.isArray(requestedFields);

  // Determine if model enrichment is needed
  // V1 API: always enrich
  // V2 API: only enrich if "model" field group is requested
  const shouldEnrichModel = !isV2 || requestedFields.includes("model");

  // Fetch model data if needed
  const models = shouldEnrichModel
    ? await (async () => {
        const uniqueModels: string[] = Array.from(
          new Set(
            observationRecords
              .map((r) => r.internal_model_id)
              .filter((r): r is string => Boolean(r)),
          ),
        );

        return uniqueModels.length > 0
          ? await prisma.model.findMany({
              where: {
                id: {
                  in: uniqueModels,
                },
                OR: [{ projectId: projectId }, { projectId: null }],
              },
              include: {
                Price: true,
              },
            })
          : [];
      })()
    : [];

  return observationRecords.map((o) => {
    const model = shouldEnrichModel
      ? models.find((m) => m.id === o.internal_model_id)
      : null;

    const renderingProps = {
      shouldJsonParse: parseIoAsJson,
      truncated: false,
    };

    // Branch based on API version to use correct overload
    const converted = isV2
      ? convertEventsObservation(o, renderingProps, false)
      : convertEventsObservation(o, renderingProps, true);

    const enriched = {
      ...converted,
      // Use ClickHouse-calculated latency/timeToFirstToken if available, otherwise use what converter calculated
      latency:
        o.latency !== undefined
          ? o.latency
            ? Number(o.latency) / 1000
            : null
          : (converted.latency ?? null),
      timeToFirstToken:
        o.time_to_first_token !== undefined
          ? o.time_to_first_token
            ? Number(o.time_to_first_token) / 1000
            : null
          : (converted.timeToFirstToken ?? null),
      // Add model pricing fields (null if not fetched)
      modelId: model?.id ?? null,
      inputPrice:
        model?.Price?.find((m) => m.usageType === "input")?.price ?? null,
      outputPrice:
        model?.Price?.find((m) => m.usageType === "output")?.price ?? null,
      totalPrice:
        model?.Price?.find((m) => m.usageType === "total")?.price ?? null,
    };

    return enriched;
  });
}

async function enrichObservationsWithTraceFields(
  observationRecords: Array<EventsObservation & ObservationPriceFields>,
): Promise<FullEventsObservations> {
  return observationRecords.map((o) => {
    return {
      ...o,
      traceTags: [], // TODO pull from PG
      traceTimestamp: null,
      toolDefinitions: o.toolDefinitions ?? null,
      toolCalls: o.toolCalls ?? null,
      // Compute counts from actual data for events table
      toolDefinitionsCount: o.toolDefinitions
        ? Object.keys(o.toolDefinitions).length
        : null,
      toolCallsCount: o.toolCalls ? o.toolCalls.length : null,
    };
  });
}

/**
 * Internal helper: extract and convert time filter from FilterList
 * Common pattern: find time filter and convert to ClickHouse DateTime format
 */
function extractTimeFilter(
  filter: FilterList,
  tableName: "events_proto" | "traces" = "events_proto",
  fieldName: "start_time" | "timestamp" = "start_time",
): string | null {
  const timeFilter = filter.find(
    (f) =>
      // For events tables, match any events_* prefix (events_proto, events_core, events_full)
      (tableName === "events_proto"
        ? f.clickhouseTable.startsWith("events_")
        : f.clickhouseTable === tableName) &&
      f.field === fieldName &&
      (f.operator === ">=" || f.operator === ">"),
  );

  return timeFilter
    ? convertDateToClickhouseDateTime((timeFilter as DateTimeFilter).value)
    : null;
}

/**
 * Column mapping for public API filters on events table (observations)
 */
const PUBLIC_API_EVENTS_COLUMN_MAPPING: ApiColumnMapping[] =
  createPublicApiObservationsColumnMapping(
    "events_proto",
    "e",
    "parent_span_id",
  );

/**
 * Column mappings for traces aggregated from events table
 */
const PUBLIC_API_TRACES_COLUMN_MAPPING = createPublicApiTracesColumnMapping(
  "traces",
  "t",
);

// For events-based traces, observation fields are aggregated into the traces CTE (with 't' prefix),
// not joined from a separate observations table (with 'o' prefix). We need to remap these.
const TRACES_FROM_EVENTS_UI_COLUMN_DEFINITIONS =
  tracesTableUiColumnDefinitions.map((col) => {
    // If this column references the observations table with 'o' prefix,
    // remap it to use 't' prefix since observations are aggregated into traces CTE
    if (col.clickhouseTableName === "observations") {
      // Replace o. prefix with t. in clickhouseSelect (only when followed by identifier)
      // Technically we do not need to deal with the prefix at all,
      // since here these columns are always used inside a CTE.
      const updatedSelect = col.clickhouseSelect.replace(
        /\bo\.([a-z_])/g,
        "t.$1",
      );

      return {
        ...col,
        clickhouseTableName: "traces", // Now it's in the traces CTE
        queryPrefix: undefined,
        clickhouseSelect: updatedSelect,
      };
    }
    return col;
  });

/**
 * Order by columns for traces CTE (post-aggregation)
 */
const allowedOrderByIds = [
  "timestamp",
  "name",
  "userId",
  "sessionId",
  "environment",
  "version",
  "release",
];
const TRACES_ORDER_BY_COLUMNS = TRACES_FROM_EVENTS_UI_COLUMN_DEFINITIONS.filter(
  (col) => allowedOrderByIds.includes(col.uiTableId),
).map((col) => ({
  ...col,
  // Adjust column names that change after aggregation (start_time -> timestamp)
  clickhouseSelect:
    col.uiTableId === "timestamp" ? "timestamp" : col.clickhouseSelect,
  queryPrefix: "t", // Use 't' prefix because we're selecting from traces CTE
}));

// TODO: introduce pagination
export const MAX_OBSERVATIONS_PER_TRACE = 10_000;

export const getObservationsForTraceFromEventsTable = async (params: {
  projectId: string;
  traceId: string;
  timestamp?: Date;
}): Promise<{ observations: FullEventsObservations; totalCount: number }> => {
  const { projectId, traceId, timestamp } = params;

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

  const records =
    await getObservationsFromEventsTableInternal<ObservationsTableQueryResultWitouhtTraceFields>(
      {
        projectId,
        filter,
        orderBy: { column: "startTime", order: "ASC" },
        limit: MAX_OBSERVATIONS_PER_TRACE + 1,
        offset: 0,
        select: "rows",
        tags: { kind: "byTraceId" },
      },
    );

  const totalCount = records.length;

  const withModelData = await enrichObservationsWithModelData(
    records.slice(0, MAX_OBSERVATIONS_PER_TRACE),
    projectId,
    false,
    null,
  );
  const observations = await enrichObservationsWithTraceFields(withModelData);

  return { observations, totalCount };
};

export const getObservationsCountFromEventsTable = async (
  opts: ObservationTableQuery,
) => {
  const count = await getObservationsFromEventsTableInternal<{
    count: string;
  }>({
    ...opts,
    select: "count",
    tags: { kind: "count" },
  });

  return Number(count[0].count);
};

export const getObservationsWithModelDataFromEventsTable = async (
  opts: ObservationTableQuery,
): Promise<FullEventsObservations> => {
  const observationRecords =
    await getObservationsFromEventsTableInternal<ObservationsTableQueryResultWitouhtTraceFields>(
      {
        ...opts,
        select: "rows",
        tags: { kind: "list" },
      },
    );

  const withModelData: Array<EventsObservation & ObservationPriceFields> =
    await enrichObservationsWithModelData(
      observationRecords,
      opts.projectId,
      false,
      null, // V1 path: always enrich all fields
    );

  return enrichObservationsWithTraceFields(withModelData);
};

async function getObservationsFromEventsTableInternal<T>(
  opts: ObservationTableQuery & {
    select: "count" | "rows";
    tags: Record<string, string>;
  },
): Promise<Array<T>> {
  const {
    projectId,
    filter,
    selectIOAndMetadata,
    renderingProps = DEFAULT_RENDERING_PROPS,
    limit,
    offset,
    orderBy,
    clickhouseConfigs,
  } = opts;

  // Extract positionInTrace filter and build baseFilter without it
  const positionFilter = filter.find((f) => f.type === "positionInTrace");
  // Extract levelInTrace filters (number type, may have multiple for range: >= and <=)
  const levelFilters = filter.filter(
    (f) => f.column === "levelInTrace" && f.type === "number",
  );
  const baseFilter: typeof filter = [
    ...filter.filter(
      (f) => f.type !== "positionInTrace" && f.column !== "levelInTrace",
    ),
  ];

  // Build filter list from baseFilter (without positionInTrace)
  const observationsFilter = new FilterList(
    createFilterFromFilterState(baseFilter, eventsTableUiColumnDefinitions),
  );

  const startTimeFrom = extractTimeFilter(observationsFilter);
  const hasScoresFilter = baseFilter.some((f) =>
    f.column.toLowerCase().includes("score"),
  );
  const search = clickhouseSearchCondition(
    opts.searchQuery,
    opts.searchType,
    "e",
    ["span_id", "name", "user_id", "session_id", "trace_id"],
  );

  // Query optimization: joining traces onto observations is expensive.
  // Only join if search query requires it.
  // TODO further optimize by checking if specific trace fields are filtered on.
  const needsTraceJoin = search.query;

  const orderByEntries = orderByToEntries(
    [orderBy ?? null],
    eventsTableUiColumnDefinitions,
  );

  // Build query using EventsQueryBuilder
  const queryBuilder = new EventsQueryBuilder({ projectId });

  if (opts.select === "count") {
    queryBuilder.selectFieldSet("count");
  } else {
    queryBuilder.selectFieldSet("base", "calculated");
    if (selectIOAndMetadata) {
      queryBuilder
        .selectIO(
          renderingProps.truncated,
          env.LANGFUSE_SERVER_SIDE_IO_CHAR_LIMIT,
        )
        .selectFieldSet("metadata");
    }
  }

  // Handle positionInTrace via CTE with ROW_NUMBER()
  // All modes use the same pattern: rank observations per trace, pick rn = N.
  // root/nthFromStart → ORDER BY start_time ASC
  // last/nthFromEnd   → ORDER BY start_time DESC
  if (positionFilter && "key" in positionFilter) {
    const key = positionFilter.key;
    const isFromEnd = key === "last" || key === "nthFromEnd";
    const direction = isFromEnd ? "DESC" : "ASC";
    const position =
      key === "last" || key === "root"
        ? 1
        : typeof positionFilter.value === "number"
          ? positionFilter.value
          : 1;

    // Build observation-only filter for CTE (no s.* or t.* references)
    const nativeFilter = new FilterList(
      createFilterFromFilterState(
        baseFilter,
        eventsTableNativeUiColumnDefinitions,
      ),
    );
    const appliedNativeFilter = nativeFilter.apply();

    // Build CTE WHERE clause
    const nativeFilterClause = appliedNativeFilter.query
      .trim()
      .replace(/^(AND|OR)\s+/i, "");
    const searchClause = search.query.trim().replace(/^(AND|OR)\s+/i, "");
    let cteWhere = "e.project_id = {projectId: String}";
    if (nativeFilterClause) cteWhere += ` AND ${nativeFilterClause}`;
    if (searchClause) cteWhere += ` AND ${searchClause}`;

    // TODO: Build this CTE via a query builder instead of raw SQL string
    queryBuilder.withCTE("qualifying_obs", {
      query: `SELECT e.span_id, ROW_NUMBER() OVER (PARTITION BY e.trace_id ORDER BY e.start_time ${direction}, e.event_ts ${direction}, e.span_id ${direction}) as _rn FROM events_core e WHERE ${cteWhere}`,
      params: { projectId, ...appliedNativeFilter.params, ...search.params },
    });

    queryBuilder.whereRaw(
      "e.span_id IN (SELECT span_id FROM qualifying_obs WHERE _rn = {_posRn: UInt32})",
      { _posRn: Math.max(1, position) },
    );
  }

  // Handle levelInTrace via recursive CTE
  // Level 0 = root (no parent), level 1 = direct children of root, etc.
  if (levelFilters.length > 0) {
    const nativeLevelFilter = new FilterList(
      createFilterFromFilterState(
        baseFilter,
        eventsTableNativeUiColumnDefinitions,
      ),
    );
    const appliedNativeLevelFilter = nativeLevelFilter.apply();
    const nativeLevelClause = appliedNativeLevelFilter.query
      .trim()
      .replace(/^(AND|OR)\s+/i, "");

    let cteScope = "e.project_id = {projectId: String}";
    if (nativeLevelClause) cteScope += ` AND ${nativeLevelClause}`;

    // Each UNION ALL branch has its own namespace scope, so `e` can be reused safely.
    const levelCteQuery = [
      // Anchor: root observations (no parent)
      `SELECT e.span_id, e.trace_id, 0 AS level FROM events_core e WHERE ${cteScope} AND e.parent_span_id = ''`,
      "UNION ALL",
      // Recursive: children
      `SELECT e.span_id, e.trace_id, parent.level + 1 AS level FROM events_core e JOIN level_tree parent ON e.parent_span_id = parent.span_id AND e.trace_id = parent.trace_id WHERE e.project_id = {projectId: String}${nativeLevelClause ? ` AND ${nativeLevelClause}` : ""}`,
    ].join(" ");

    // TODO: Build this CTE via a query builder instead of raw SQL string
    queryBuilder.withRecursiveCTE("level_tree", {
      query: levelCteQuery,
      params: { projectId, ...appliedNativeLevelFilter.params },
    });

    // Build WHERE conditions for each level filter
    const levelConditions: string[] = [];
    const levelParams: Record<string, number> = {};
    levelFilters.forEach((lf, idx) => {
      if (lf.type === "number") {
        const paramName = `_levelVal${idx}`;
        levelConditions.push(`level ${lf.operator} {${paramName}: UInt32}`);
        // Round to integer — level is always a whole number depth
        levelParams[paramName] = Math.round(lf.value);
      }
    });

    const levelWhere = levelConditions.join(" AND ");
    queryBuilder.whereRaw(
      `e.span_id IN (SELECT span_id FROM level_tree WHERE ${levelWhere})`,
      levelParams,
    );
  }

  queryBuilder
    .when(hasScoresFilter, (b) =>
      b.withCTE(
        "scores_agg",
        eventsScoresAggregation({ projectId, startTimeFrom }),
      ),
    )
    .when(Boolean(needsTraceJoin), (b) =>
      b.withCTE(
        "traces",
        eventsTracesAggregation({ projectId, startTimeFrom }).buildWithParams(),
      ),
    )
    .when(Boolean(needsTraceJoin), (b) =>
      b.leftJoin(
        "traces t",
        "ON t.id = e.trace_id AND t.project_id = e.project_id",
      ),
    )
    .when(hasScoresFilter, (b) =>
      b.leftJoin("scores_agg AS s", "ON s.observation_id = e.span_id"),
    )
    .applyFilters(observationsFilter)
    .where(search)
    .when(orderByEntries.length > 0, (b) => b.orderByColumns(orderByEntries))
    .limit(limit, offset);

  const { query, params } = queryBuilder.buildWithParams();

  return measureAndReturn({
    operationName: "getObservationsFromEventsTableInternal",
    projectId,
    input: {
      params,
      tags: {
        ...(opts.tags ?? {}),
        feature: "tracing",
        type: "events",
        projectId,
        kind: opts.select,
        operation_name: "getObservationsTableInternal",
      },
    },
    fn: async (input) => {
      return queryClickhouse<T>({
        query,
        params: input.params,
        tags: input.tags,
        clickhouseConfigs,
        preferredClickhouseService: "EventsReadOnly",
      });
    },
  });
}

export const getObservationByIdFromEventsTable = async ({
  id,
  projectId,
  fetchWithInputOutput = false,
  startTime,
  type,
  traceId,
  renderingProps = DEFAULT_RENDERING_PROPS,
  preferredClickhouseService,
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
  const records = await getObservationByIdFromEventsTableInternal({
    id,
    projectId,
    fetchWithInputOutput,
    startTime,
    type,
    traceId,
    renderingProps,
    preferredClickhouseService: preferredClickhouseService ?? "EventsReadOnly",
  });
  const mapped = records.map((record) =>
    convertObservation(record, renderingProps),
  );

  mapped.forEach((observation) => {
    recordDistribution(
      "langfuse.query_by_id_age",
      new Date().getTime() - observation.startTime.getTime(),
      {
        table: "events",
      },
    );
  });
  if (mapped.length === 0) {
    throw new LangfuseNotFoundError(`Observation with id ${id} not found`);
  }

  if (mapped.length > 1) {
    logger.error(
      `Multiple observations found for id ${id} and project ${projectId}`,
    );
    throw new InternalServerError(
      `Multiple observations found for id ${id} and project ${projectId}`,
    );
  }
  return mapped.shift();
};

async function getObservationByIdFromEventsTableInternal({
  id,
  projectId,
  fetchWithInputOutput = false,
  startTime,
  type,
  traceId,
  renderingProps = DEFAULT_RENDERING_PROPS,
  preferredClickhouseService,
}: {
  id: string;
  projectId: string;
  fetchWithInputOutput?: boolean;
  startTime?: Date;
  type?: ObservationType;
  traceId?: string;
  renderingProps?: RenderingProps;
  preferredClickhouseService?: PreferredClickhouseService;
}) {
  const queryBuilder = new EventsQueryBuilder({ projectId })
    .selectFieldSet("byIdBase", "byIdModel", "byIdPrompt", "byIdTimestamps")
    .when(fetchWithInputOutput, (b) =>
      b.selectIO(
        renderingProps.truncated,
        env.LANGFUSE_SERVER_SIDE_IO_CHAR_LIMIT,
      ),
    )
    .whereRaw("span_id = {id: String}", { id })
    .when(Boolean(startTime), (b) =>
      b.whereRaw("toDate(start_time) = toDate({startTime: DateTime64(3)})", {
        startTime: convertDateToClickhouseDateTime(startTime!),
      }),
    )
    .when(Boolean(type), (b) => b.whereRaw("type = {type: String}", { type }))
    .when(Boolean(traceId), (b) =>
      b.whereRaw("trace_id = {traceId: String}", { traceId }),
    )
    .orderByColumns([
      { column: "start_time", direction: "DESC" },
      { column: "event_ts", direction: "DESC" },
    ])
    .limit(1, 0);

  const { query, params } = queryBuilder.buildWithParams();

  return await queryClickhouse<ObservationRecordReadType>({
    query,
    params,
    tags: {
      feature: "tracing",
      type: "events",
      kind: "byId",
      projectId,
    },
    preferredClickhouseService,
  });
}

/**
 * Get a trace by ID from the events table.
 * Compatible with getTraceById but queries the events table instead.
 */
export const getTraceByIdFromEventsTable = async ({
  traceId,
  projectId,
  timestamp,
  fromTimestamp,
  renderingProps = DEFAULT_RENDERING_PROPS,
  clickhouseFeatureTag = "tracing",
  preferredClickhouseService,
}: {
  traceId: string;
  projectId: string;
  timestamp?: Date;
  fromTimestamp?: Date;
  renderingProps?: RenderingProps;
  clickhouseFeatureTag?: string;
  preferredClickhouseService?: PreferredClickhouseService;
}) => {
  // Build traces CTE using eventsTracesAggregation
  // Pass truncated flag to select events_core (truncated) or events_full (full I/O)
  const tracesBuilder = eventsTracesAggregation({
    projectId,
    traceIds: [traceId],
    startTimeFrom: fromTimestamp
      ? convertDateToClickhouseDateTime(fromTimestamp)
      : null,
    truncated: renderingProps.truncated,
  });

  // Build the final query
  const queryBuilder = new CTEQueryBuilder()
    .withCTEFromBuilder("traces", tracesBuilder)
    .from("traces", "t")
    .selectColumns(
      "t.id",
      "t.name",
      "t.user_id",
      "t.metadata",
      "t.release",
      "t.version",
      "t.project_id",
      "t.environment",
      "t.public",
      "t.bookmarked",
      "t.tags",
      "t.session_id",
      "t.timestamp",
      "t.created_at",
      "t.updated_at",
    )
    .select("0 as is_deleted");

  if (timestamp) {
    queryBuilder.whereRaw(
      `toDate(t.timestamp) = toDate({timestamp: DateTime64(3)})`,
      {
        timestamp: convertDateToClickhouseDateTime(timestamp),
      },
    );
  }

  // Handle input/output with truncation
  // Note: eventsTracesAggregation above is responsible for choosing events_core/events_full
  if (renderingProps.truncated) {
    queryBuilder
      .select(
        `leftUTF8(t.input, ${env.LANGFUSE_SERVER_SIDE_IO_CHAR_LIMIT}) as input`,
      )
      .select(
        `leftUTF8(t.output, ${env.LANGFUSE_SERVER_SIDE_IO_CHAR_LIMIT}) as output`,
      );
  } else {
    queryBuilder.selectColumns("t.input", "t.output");
  }

  queryBuilder.orderBy("ORDER BY t.timestamp DESC").limit(1);

  const { query, params } = queryBuilder.buildWithParams();

  const records = await measureAndReturn({
    operationName: "getTraceByIdFromEventsTable",
    projectId,
    input: {
      params,
      tags: {
        feature: clickhouseFeatureTag,
        type: "trace",
        kind: "byId",
        projectId,
        operation_name: "getTraceByIdFromEventsTable",
      },
    },
    fn: async (input) => {
      return queryClickhouse<TraceRecordReadType>({
        query,
        params: input.params,
        tags: input.tags,
        preferredClickhouseService,
      });
    },
  });

  const res = records.map((record) =>
    convertClickhouseToDomain(record, renderingProps),
  );

  res.forEach((trace) => {
    recordDistribution(
      "langfuse.query_by_id_age",
      new Date().getTime() - trace.timestamp.getTime(),
      {
        table: "events",
      },
    );
  });

  return res.shift();
};

/**
 * Field groups for selective field fetching in v2 observations API
 *
 * - core: Always included (cursor-required fields)
 * - basic, time, io, metadata, model, usage, prompt, metrics: Optional groups
 */
export const OBSERVATION_FIELD_GROUPS = [
  "core", // Always included: id, traceId, startTime, endTime, projectId, parentObservationId, type
  "basic", // name, level, statusMessage, version, environment, bookmarked, public, userId, sessionId
  "time", // completionStartTime, createdAt, updatedAt
  "io", // input, output
  "metadata", // metadata
  "model", // providedModelName, internalModelId, modelParameters
  "usage", // usageDetails, costDetails, totalCost
  "prompt", // promptId, promptName, promptVersion
  "metrics", // latency, timeToFirstToken
] as const;

export type ObservationFieldGroup = (typeof OBSERVATION_FIELD_GROUPS)[number];

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
  advancedFilters?: FilterState;
  parseIoAsJson?: boolean;
  cursor?: {
    lastStartTimeTo: Date;
    lastTraceId: string;
    lastId: string;
  };
  fields?: ObservationFieldGroup[] | null;
  /**
   * Metadata keys to expand (return full non-truncated values).
   * - null/undefined: use truncated metadata (default behavior)
   * - string[]: expand specified keys (or all keys if empty array)
   */
  expandMetadataKeys?: string[] | null;
};

/**
 * Build observation query components: an EventsQueryBuilder (with JOINs and filters but
 * without CTEs) and any external CTEs that should be composed at the outer level.
 *
 * This enables CTE-based split queries where external CTEs (e.g. traces) are hoisted
 * to the outer WITH clause rather than embedded in the EventsQueryBuilder.
 */
function buildObservationsQueryComponents(
  opts: PublicApiObservationsQuery,
  columnDefinitions: UiColumnMappings = eventsTableNativeUiColumnDefinitions,
): {
  queryBuilder: EventsQueryBuilder;
  externalCTEs: Array<{
    name: string;
    queryWithParams: { query: string; params: Record<string, any> };
  }>;
} {
  const { projectId, advancedFilters, ...filterParams } = opts;

  // Convert and merge simple and advanced filters
  const observationsFilter = deriveFilters(
    { ...filterParams, projectId },
    PUBLIC_API_EVENTS_COLUMN_MAPPING,
    advancedFilters,
    columnDefinitions,
  );

  // Determine if we need to join traces (check both simple params and advanced filters)
  const hasTraceFilter = observationsFilter.some(
    (f) => f.clickhouseTable === "traces",
  );

  // Extract time filter and apply filters
  const startTimeFrom = extractTimeFilter(observationsFilter);
  const appliedFilter = observationsFilter.apply();

  // Build external CTEs
  const externalCTEs: Array<{
    name: string;
    queryWithParams: { query: string; params: Record<string, any> };
  }> = [];
  if (hasTraceFilter) {
    externalCTEs.push({
      name: "traces",
      queryWithParams: eventsTracesAggregation({
        projectId,
        startTimeFrom,
      }).buildWithParams(),
    });
  }

  // Build query with joins and filters (no CTEs)
  const queryBuilder = new EventsQueryBuilder({ projectId })
    .when(hasTraceFilter, (b) =>
      b.leftJoin(
        "traces t",
        "ON t.id = e.trace_id AND t.project_id = e.project_id",
      ),
    )
    .where(appliedFilter);

  return { queryBuilder, externalCTEs };
}

function buildObservationsQueryBase(
  opts: PublicApiObservationsQuery,
  columnDefinitions: UiColumnMappings = eventsTableNativeUiColumnDefinitions,
): EventsQueryBuilder {
  const { queryBuilder, externalCTEs } = buildObservationsQueryComponents(
    opts,
    columnDefinitions,
  );
  for (const cte of externalCTEs) {
    queryBuilder.withCTE(cte.name, cte.queryWithParams);
  }
  return queryBuilder;
}

function orderByForObservationsQuery(
  prefix: string = "e",
  span_id: string = "span_id",
): OrderByEntry[] {
  // Order by to cursor ordering.
  // project_id and potentially other prefixes are injected in the query builder when necessary
  return [
    { column: `${prefix}.start_time`, direction: "DESC" as const },
    { column: `xxHash32(${prefix}.trace_id)`, direction: "DESC" as const },
    { column: `${prefix}.${span_id}`, direction: "DESC" as const },
  ];
}

function applyOrderByForObservationsQuery(
  queryBuilder: EventsQueryBuilder,
): EventsQueryBuilder {
  return queryBuilder.orderByColumns(orderByForObservationsQuery("e"));
}

function applyOffsetPagination(
  opts: PublicApiObservationsQuery,
  queryBuilder: EventsQueryBuilder,
): EventsQueryBuilder {
  // Apply offset pagination for page-based requests
  const offset = (opts.page - 1) * opts.limit;
  return queryBuilder.limit(opts.limit, offset);
}

function applyCursorPagination(
  opts: PublicApiObservationsQuery,
  queryBuilder: EventsQueryBuilder,
): EventsQueryBuilder {
  // Apply cursor filter if provided
  queryBuilder = queryBuilder.when(Boolean(opts.cursor), (b) => {
    const cursor = opts.cursor!;
    return b.whereRaw(
      "e.start_time <= {lastStartTime: DateTime64(6)} AND (e.start_time, xxHash32(e.trace_id), e.span_id) < ({lastStartTime: DateTime64(6)}, xxHash32({lastTraceId: String}), {lastId: String})",
      {
        lastStartTime: convertDateToClickhouseDateTime(cursor.lastStartTimeTo),
        lastTraceId: cursor.lastTraceId,
        lastId: cursor.lastId,
      },
    );
  });

  // Always apply limit (fetch limit+1 to detect if there are more results)
  return queryBuilder.limit(opts.limit + 1, undefined);
}

async function getObservationsRowsFromBuilder<T>(
  projectId: string,
  queryBuilder: QueryWithParams,
  operationName: string = "getObservationsFromEventsTableForPublicApi_rows",
): Promise<Array<T>> {
  const { query, params } = queryBuilder.buildWithParams();

  return await measureAndReturn({
    operationName,
    projectId,
    input: {
      params,
      tags: {
        feature: "tracing",
        type: "events",
        kind: "publicApiRows",
        projectId,
      },
    },
    fn: async (input) => {
      return await queryClickhouse<T>({
        query,
        params: input.params,
        tags: input.tags,
        preferredClickhouseService: "EventsReadOnly",
      });
    },
  });
}

/**
 * Internal function to get count of observations from events table for public API.
 */
async function getObservationsCountFromEventsTableForPublicApiInternal(
  opts: PublicApiObservationsQuery,
): Promise<Array<{ count: string }>> {
  const { projectId } = opts;

  // Build query with filters and common CTEs
  const queryBuilder = buildObservationsQueryBase(opts);

  // Select count field set
  queryBuilder.selectFieldSet("count");

  const { query, params } = queryBuilder.buildWithParams();

  const result = await measureAndReturn({
    operationName: "getObservationsFromEventsTableForPublicApi_count",
    projectId,
    input: {
      params,
      tags: {
        feature: "tracing",
        type: "events",
        kind: "publicApiCount",
        projectId,
      },
    },
    fn: async (input) => {
      return await queryClickhouse<{ count: string }>({
        query,
        params: input.params,
        tags: input.tags,
        preferredClickhouseService: "EventsReadOnly",
      });
    },
  });

  return result;
}

/**
 * V1 API: Get observations list from events table for public API
 * Returns complete observations with all fields for transformDbToApiObservation
 */
export const getObservationsFromEventsTableForPublicApi = async (
  opts: Omit<PublicApiObservationsQuery, "fields">,
): Promise<Array<Observation & ObservationPriceFields>> => {
  const { projectId } = opts;

  // Build query with filters and common CTEs
  const queryBuilder = applyOffsetPagination(
    opts,
    applyOrderByForObservationsQuery(buildObservationsQueryBase(opts)),
  );

  OBSERVATION_FIELD_GROUPS.forEach((fieldGroup) => {
    queryBuilder.selectFieldSet(fieldGroup);
  });

  const observationRecords =
    await getObservationsRowsFromBuilder<ObservationsTableQueryResultWitouhtTraceFields>(
      projectId,
      queryBuilder,
    );
  return await enrichObservationsWithModelData(
    observationRecords,
    opts.projectId,
    opts.parseIoAsJson ?? true, // V1 API: default to parsing JSON (backwards compatibility)
    null, // V1 API: no field groups, return complete observations
  );
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
  opts: PublicApiObservationsQuery & { fields: ObservationFieldGroup[] },
): Promise<Array<EventsObservationPublic>> => {
  const { projectId, expandMetadataKeys } = opts;

  // Determine which field groups to include
  const requestedFields = opts.fields ?? ["core", "basic"];

  const needsIO = requestedFields.includes("io");
  const needsExpandedMetadata =
    requestedFields.includes("metadata") &&
    expandMetadataKeys != null &&
    expandMetadataKeys.length > 0;
  const needsIOCTE = needsIO || needsExpandedMetadata;
  // Metadata goes to io CTE when in CTE mode and metadata is requested
  const metadataFromFullTable =
    needsIOCTE && requestedFields.includes("metadata");

  // Shared: build base query with field sets, ordering, pagination
  const { queryBuilder: baseBuilder, externalCTEs } =
    buildObservationsQueryComponents(
      opts,
      eventsTableNativeUiColumnDefinitions,
    );

  baseBuilder.selectFieldSet("core");
  const excludeFromBase = new Set<string>(["core", "io"]);
  if (metadataFromFullTable) excludeFromBase.add("metadata");
  requestedFields
    .filter((fg) => !excludeFromBase.has(fg))
    .forEach((fg) => baseBuilder.selectFieldSet(fg));

  applyOrderByForObservationsQuery(baseBuilder);
  applyCursorPagination(opts, baseBuilder);

  let builder: QueryWithParams;

  if (!needsIOCTE) {
    // Simple path: add CTEs back to the builder and use directly
    for (const cte of externalCTEs) {
      baseBuilder.withCTE(cte.name, cte.queryWithParams);
    }
    builder = baseBuilder;
  } else {
    builder = buildEventsFullTableSplitQuery({
      projectId,
      baseBuilder,
      includeIO: needsIO,
      includeMetadata: metadataFromFullTable,
      externalCTEs,
    }).orderByColumns(orderByForObservationsQuery("b", "id"));
  }

  const records =
    await getObservationsRowsFromBuilder<ObservationsTableQueryResultWitouhtTraceFields>(
      projectId,
      builder,
    );

  return await enrichObservationsWithModelData(
    records,
    projectId,
    false, // V2 API: IO fields are always returned as raw strings
    opts.fields, // V2 API: field groups specified, return partial observations
  );
};

/**
 * Get count of observations from events table for public API.
 */
export const getObservationsCountFromEventsTableForPublicApi = async (
  opts: PublicApiObservationsQuery,
): Promise<number> => {
  const countResult =
    await getObservationsCountFromEventsTableForPublicApiInternal(opts);
  return Number(countResult[0].count);
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
 * Internal implementation for public API traces queries.
 * Uses eventsTracesAggregation to create a traces CTE that
 * behaves similarly to the old traces table.
 */
async function getTracesFromEventsTableForPublicApiInternal<T>(
  opts: PublicApiTracesQuery & { select: "rows" | "count" },
): Promise<Array<T>> {
  const {
    projectId,
    page,
    limit,
    advancedFilters,
    fields,
    orderBy,
    ...filterParams
  } = opts;

  // Determine which field groups are requested
  const includeIO = Boolean(fields?.includes("io"));
  const includeScores = Boolean(fields?.includes("scores"));
  const includeObservations = Boolean(fields?.includes("observations"));
  const includeMetrics = Boolean(fields?.includes("metrics"));

  // Convert and merge simple and advanced filters
  const tracesFilter = deriveFilters(
    { ...filterParams, projectId, page, limit },
    PUBLIC_API_TRACES_COLUMN_MAPPING,
    advancedFilters,
    TRACES_FROM_EVENTS_UI_COLUMN_DEFINITIONS,
  );

  // Extract time filter for cut-off point in eventsTracesAggregation
  // After aggregation, the time column is "timestamp" (not "start_time")
  const startTimeFrom = extractTimeFilter(tracesFilter, "traces", "timestamp");

  const appliedFilter = tracesFilter.apply();

  // Check if any filters reference the scores table
  const filtersNeedScores = tracesFilter.some(
    (f) => f.clickhouseTable === "scores",
  );

  // Check if filters specifically reference score aggregation columns
  const hasScoreAggregationFilters = tracesFilter.some(
    (f) => f.field === "s.scores_avg" || f.field === "s.score_categories",
  );

  // Build traces CTE using eventsTracesAggregation WITHOUT filters
  // Filters must be applied AFTER aggregation to ensure filters on aggregated
  // fields (like timestamp or version) are applied correctly
  // Use events_full when I/O is requested (truncated: false), otherwise events_core
  const tracesBuilder = eventsTracesAggregation({
    projectId,
    startTimeFrom,
    truncated: !includeIO,
  });

  // Build the final query using CTEQueryBuilder
  let queryBuilder = new CTEQueryBuilder()
    .withCTEFromBuilder("traces", tracesBuilder)
    .from("traces", "t")
    .where(appliedFilter);

  if (includeScores || filtersNeedScores) {
    const scoresCTE = eventsTracesScoresAggregation({
      projectId,
      startTimeFrom,
      hasScoreAggregationFilters,
    });
    queryBuilder = queryBuilder
      .withCTE("score_stats", {
        ...scoresCTE,
        schema: [
          "trace_id",
          "project_id",
          "score_ids",
          "scores_avg",
          "score_categories",
        ],
      })
      .leftJoin(
        "score_stats",
        "s",
        "ON s.trace_id = t.id AND s.project_id = t.project_id",
      );
  }

  // Select fields based on query type and field groups
  if (opts.select === "count") {
    queryBuilder.select("count() as count");
  } else {
    // Build select list
    queryBuilder = queryBuilder.selectColumns(
      "t.id",
      "t.project_id",
      "t.timestamp",
      "t.name",
      "t.environment",
      "t.session_id",
      "t.user_id",
      "t.version",
      "t.created_at",
      "t.updated_at",
      "t.tags",
      "t.bookmarked",
      "t.public",
      "t.release",
    );

    queryBuilder.select(
      "CONCAT('/project/', t.project_id, '/traces/', t.id) as htmlPath",
    );

    // Conditionally include other field groups
    if (includeIO) {
      queryBuilder = queryBuilder.selectColumns(
        "t.input",
        "t.output",
        "t.metadata",
      );
    }
    if (includeScores) {
      queryBuilder.select("s.score_ids as scores");
    }
    if (includeObservations) {
      queryBuilder.select("t.observation_ids as observations");
    }
    if (includeMetrics) {
      queryBuilder.select(
        "t.total_cost as totalCost",
        "COALESCE(t.latency_milliseconds / 1000, 0) as latency",
      );
    }

    const chOrderBy =
      orderByToClickhouseSql(
        orderBy ? [orderBy] : [],
        TRACES_ORDER_BY_COLUMNS,
      ) || "ORDER BY t.project_id DESC, t.timestamp DESC";

    queryBuilder.orderBy(chOrderBy).limit(limit, (page - 1) * limit);
  }

  const { query, params } = queryBuilder.buildWithParams();

  const result = await measureAndReturn({
    operationName: `getTracesFromEventsTableForPublicApi_${opts.select}`,
    projectId,
    input: {
      params,
      tags: {
        feature: "tracing",
        type: "traces",
        kind: opts.select === "count" ? "publicApiCount" : "publicApiRows",
        projectId,
      },
    },
    fn: async (input) => {
      return await queryClickhouse<T>({
        query,
        params: input.params,
        tags: input.tags,
        preferredClickhouseService: "EventsReadOnly",
      });
    },
  });

  return result;
}

/**
 * Get traces list from events table for public API.
 * Aggregates events by trace_id to rebuild traces with observation metrics.
 */
export const getTracesFromEventsTableForPublicApi = async (
  opts: PublicApiTracesQuery,
): Promise<Array<any>> => {
  const requestedFields = opts.fields ?? [
    "core",
    "io",
    "scores",
    "observations",
    "metrics",
  ];
  const includeScores = requestedFields.includes("scores");
  const includeObservations = requestedFields.includes("observations");
  const includeMetrics = requestedFields.includes("metrics");

  const result = await getTracesFromEventsTableForPublicApiInternal<any>({
    ...opts,
    select: "rows",
  });

  // Convert ClickHouse format to domain format and handle field groups
  return convertClickhouseTracesListToDomain(result, {
    scores: includeScores,
    observations: includeObservations,
    metrics: includeMetrics,
  });
};

/**
 * Get count of traces from events table for public API.
 * Uses same aggregation as list query to ensure consistent filtering.
 */
export const getTracesCountFromEventsTableForPublicApi = async (
  opts: PublicApiTracesQuery,
): Promise<number> => {
  const countResult = await getTracesFromEventsTableForPublicApiInternal<{
    count: string;
  }>({
    ...opts,
    select: "count",
  });
  return Number(countResult[0].count);
};

const updateableEventKeys = ["bookmarked", "public"] as const;

type UpdateableEventFields = {
  [K in (typeof updateableEventKeys)[number]]?: boolean;
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
  projectId: string,
  selector: { spanIds?: string[]; traceIds?: string[]; rootOnly?: boolean },
  updates: UpdateableEventFields,
): Promise<void> => {
  const setClauses: string[] = [];
  for (const key of updateableEventKeys) {
    if (updates[key] !== undefined) {
      setClauses.push(`${key} = {${key}: Bool}`);
    }
  }
  if (setClauses.length === 0) {
    // Nothing to update
    return;
  }

  const whereClause = `
    WHERE project_id = {projectId: String}
    ${selector.spanIds ? "AND span_id IN ({spanIds: Array(String)})" : ""}
    ${selector.traceIds ? "AND trace_id IN ({traceIds: Array(String)})" : ""}
    ${selector.rootOnly === true ? "AND parent_span_id = ''" : ""}
  `;

  const params = {
    projectId,
    spanIds: selector.spanIds ?? [],
    traceIds: selector.traceIds ?? [],
    ...updates,
  };

  const useLightweightUpdate = env.CLICKHOUSE_USE_LIGHTWEIGHT_UPDATE === "true";

  const updateOpts = (table: string) => ({
    query: useLightweightUpdate
      ? `UPDATE ${table} SET ${setClauses.join(", ")} ${whereClause}`
      : `ALTER TABLE ${table} UPDATE ${setClauses.join(", ")} ${whereClause}`,
    params,
    tags: { type: table, kind: "update", projectId },
  });

  await Promise.all([
    commandClickhouse(updateOpts("events_full")),
    commandClickhouse(updateOpts("events_core")),
    commandLegacyEventsTable(updateOpts("events")),
  ]);
};

/**
 * Get grouped provided model names from events table
 * Used for filter options
 */
export const getEventsGroupedByModel = async (
  projectId: string,
  filter: FilterState,
) => {
  const eventsFilter = new FilterList(
    createFilterFromFilterState(filter, eventsTableUiColumnDefinitions),
  );

  const appliedEventsFilter = eventsFilter.apply();

  const queryBuilder = new EventsAggQueryBuilder({
    projectId,
    groupByColumn: "e.provided_model_name",
    selectExpression: "e.provided_model_name as name, count() as count",
  })
    .where(appliedEventsFilter)
    .whereRaw(
      "e.provided_model_name IS NOT NULL AND length(e.provided_model_name) > 0",
    )
    .orderBy("ORDER BY count() DESC")
    .limit(1000, 0);

  const { query, params } = queryBuilder.buildWithParams();

  const res = await queryClickhouse<{ name: string; count: number }>({
    query,
    params,
    tags: {
      feature: "tracing",
      type: "events",
      kind: "analytic",
      projectId,
    },
  });
  return res.map((r) => ({ model: r.name, count: r.count }));
};

/**
 * Get grouped model IDs from events table
 * Used for filter options
 */
export const getEventsGroupedByModelId = async (
  projectId: string,
  filter: FilterState,
) => {
  const eventsFilter = new FilterList(
    createFilterFromFilterState(filter, eventsTableUiColumnDefinitions),
  );

  const appliedEventsFilter = eventsFilter.apply();

  const queryBuilder = new EventsAggQueryBuilder({
    projectId,
    groupByColumn: "e.model_id",
    selectExpression: "e.model_id as modelId, count() as count",
  })
    .where(appliedEventsFilter)
    .whereRaw("e.model_id IS NOT NULL AND length(e.model_id) > 0")
    .orderBy("ORDER BY count() DESC")
    .limit(1000, 0);

  const { query, params } = queryBuilder.buildWithParams();

  const res = await queryClickhouse<{ modelId: string; count: number }>({
    query,
    params,
    tags: {
      feature: "tracing",
      type: "events",
      kind: "analytic",
      projectId,
    },
  });
  return res.map((r) => ({ modelId: r.modelId, count: r.count }));
};

/**
 * Get grouped observation names from events table
 * Used for filter options
 */
export const getEventsGroupedByName = async (
  projectId: string,
  filter: FilterState,
) => {
  const eventsFilter = new FilterList(
    createFilterFromFilterState(filter, eventsTableUiColumnDefinitions),
  );

  const appliedEventsFilter = eventsFilter.apply();

  const queryBuilder = new EventsAggQueryBuilder({
    projectId,
    groupByColumn: "e.name",
    selectExpression: "e.name as name, count() as count",
  })
    .where(appliedEventsFilter)
    .whereRaw("e.name IS NOT NULL AND length(e.name) > 0")
    .orderBy("ORDER BY count() DESC")
    .limit(1000, 0);

  const { query, params } = queryBuilder.buildWithParams();

  const res = await queryClickhouse<{ name: string; count: number }>({
    query,
    params,
    tags: {
      feature: "tracing",
      type: "events",
      kind: "analytic",
      projectId,
    },
  });
  return res;
};

/**
 * Get grouped trace names from events table
 * Used for filter options
 */
export const getEventsGroupedByTraceName = async (
  projectId: string,
  filter: FilterState,
  opts?: { extraWhereRaw?: string },
) => {
  const eventsFilter = new FilterList(
    createFilterFromFilterState(filter, eventsTableUiColumnDefinitions),
  );

  const appliedEventsFilter = eventsFilter.apply();

  const queryBuilder = new EventsAggQueryBuilder({
    projectId,
    groupByColumn: "e.trace_name",
    selectExpression: "e.trace_name as traceName, count() as count",
  })
    .where(appliedEventsFilter)
    .whereRaw("e.trace_name IS NOT NULL AND length(e.trace_name) > 0")
    .orderBy("ORDER BY count() DESC")
    .limit(1000, 0);

  if (opts?.extraWhereRaw) queryBuilder.whereRaw(opts.extraWhereRaw);

  const { query, params } = queryBuilder.buildWithParams();

  const res = await queryClickhouse<{ traceName: string; count: number }>({
    query,
    params,
    tags: {
      feature: "tracing",
      type: "events",
      kind: "analytic",
      projectId,
    },
  });
  return res;
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
  opts?: { extraWhereRaw?: string },
) => {
  const eventsFilter = new FilterList(
    createFilterFromFilterState(filter, eventsTableUiColumnDefinitions),
  );

  const appliedEventsFilter = eventsFilter.apply();

  const filteredEventsBuilder = new EventsQueryBuilder({ projectId })
    .selectRaw("e.tags AS tags")
    .where(appliedEventsFilter)
    .whereRaw("e.is_deleted = 0")
    .whereRaw("notEmpty(e.tags)");

  if (opts?.extraWhereRaw) filteredEventsBuilder.whereRaw(opts.extraWhereRaw);

  const { query: filteredEventsQuery, params: filteredEventsParams } =
    filteredEventsBuilder.buildWithParams();

  const tagsQueryBuilder = new CTEQueryBuilder()
    .withCTE("filtered_events", {
      query: filteredEventsQuery,
      params: filteredEventsParams,
      schema: ["tags"],
    })
    .from("filtered_events", "fe")
    .select("DISTINCT arrayJoin(fe.tags) AS tag")
    .orderBy("ORDER BY tag ASC")
    .limit(1000, 0);

  const { query, params } = tagsQueryBuilder.buildWithParams();

  return measureAndReturn({
    operationName: "getEventsGroupedByTraceTags",
    projectId,
    input: { params },
    fn: async (input) => {
      return queryClickhouse<{ tag: string }>({
        query,
        params: input.params,
        tags: {
          feature: "tracing",
          type: "events",
          kind: "analytic",
          projectId,
        },
      });
    },
  });
};

/**
 * Get grouped prompt names from events table
 * Used for filter options
 */
export const getEventsGroupedByPromptName = async (
  projectId: string,
  filter: FilterState,
) => {
  const eventsFilter = new FilterList(
    createFilterFromFilterState(filter, eventsTableUiColumnDefinitions),
  );

  const appliedEventsFilter = eventsFilter.apply();

  const queryBuilder = new EventsAggQueryBuilder({
    projectId,
    groupByColumn: "e.prompt_name",
    selectExpression: "e.prompt_name as promptName, count() as count",
  })
    .whereRaw("e.type = 'GENERATION'")
    .whereRaw("e.prompt_name IS NOT NULL AND e.prompt_name != ''")
    .where(appliedEventsFilter)
    .orderBy("ORDER BY count() DESC")
    .limit(1000, 0);

  const { query, params } = queryBuilder.buildWithParams();

  const res = await queryClickhouse<{ promptName: string; count: number }>({
    query,
    params,
    tags: {
      feature: "tracing",
      type: "events",
      kind: "analytic",
      projectId,
    },
  });

  return res.filter((r) => Boolean(r.promptName));
};

/**
 * Get grouped observation types from events table
 * Used for filter options
 */
export const getEventsGroupedByType = async (
  projectId: string,
  filter: FilterState,
) => {
  const eventsFilter = new FilterList(
    createFilterFromFilterState(filter, eventsTableUiColumnDefinitions),
  );

  const appliedEventsFilter = eventsFilter.apply();

  const queryBuilder = new EventsAggQueryBuilder({
    projectId,
    groupByColumn: "e.type",
    selectExpression: "e.type as type, count() as count",
  })
    .where(appliedEventsFilter)
    .whereRaw("e.type IS NOT NULL AND length(e.type) > 0")
    .orderBy("ORDER BY count() DESC")
    .limit(1000, 0);

  const { query, params } = queryBuilder.buildWithParams();

  const res = await queryClickhouse<{ type: string; count: number }>({
    query,
    params,
    tags: {
      feature: "tracing",
      type: "events",
      kind: "analytic",
      projectId,
    },
  });
  return res;
};

/**
 * Get grouped user IDs from events table (joined with traces)
 * Used for filter options
 */
export const getEventsGroupedByUserId = async (
  projectId: string,
  filter: FilterState,
  opts?: { extraWhereRaw?: string },
) => {
  const eventsFilter = new FilterList(
    createFilterFromFilterState(filter, eventsTableUiColumnDefinitions),
  );

  const appliedEventsFilter = eventsFilter.apply();

  // We mainly use queries like this to retrieve filter options.
  // Therefore, we can skip final as some inaccuracy in count is acceptable.
  const queryBuilder = new EventsAggQueryBuilder({
    projectId,
    groupByColumn: "e.user_id",
    selectExpression: "e.user_id as userId, count() as count",
  })
    .where(appliedEventsFilter)
    .whereRaw("e.user_id IS NOT NULL AND length(e.user_id) > 0")
    .orderBy("ORDER BY count() DESC")
    .limit(1000, 0);

  if (opts?.extraWhereRaw) queryBuilder.whereRaw(opts.extraWhereRaw);

  const { query, params } = queryBuilder.buildWithParams();

  const res = await queryClickhouse<{ userId: string; count: number }>({
    query,
    params,
    tags: {
      feature: "tracing",
      type: "events",
      kind: "analytic",
      projectId,
    },
  });
  return res;
};

/**
 * Get grouped versions from events table
 * Used for filter options
 */
export const getEventsGroupedByVersion = async (
  projectId: string,
  filter: FilterState,
) => {
  const eventsFilter = new FilterList(
    createFilterFromFilterState(filter, eventsTableUiColumnDefinitions),
  );

  const appliedEventsFilter = eventsFilter.apply();

  // We mainly use queries like this to retrieve filter options.
  // Therefore, we can skip final as some inaccuracy in count is acceptable.
  const queryBuilder = new EventsAggQueryBuilder({
    projectId,
    groupByColumn: "e.version",
    selectExpression: "e.version as version, count() as count",
  })
    .where(appliedEventsFilter)
    .whereRaw("e.version IS NOT NULL AND length(e.version) > 0")
    .orderBy("ORDER BY count() DESC")
    .limit(1000, 0);

  const { query, params } = queryBuilder.buildWithParams();

  const res = await queryClickhouse<{ version: string; count: number }>({
    query,
    params,
    tags: {
      feature: "tracing",
      type: "events",
      kind: "analytic",
      projectId,
    },
  });
  return res;
};

/**
 * Get grouped session IDs from events table (joined with traces)
 * Used for filter options
 */
export const getEventsGroupedBySessionId = async (
  projectId: string,
  filter: FilterState,
) => {
  const eventsFilter = new FilterList(
    createFilterFromFilterState(filter, eventsTableUiColumnDefinitions),
  );

  const appliedEventsFilter = eventsFilter.apply();

  // We mainly use queries like this to retrieve filter options.
  // Therefore, we can skip final as some inaccuracy in count is acceptable.
  const queryBuilder = new EventsAggQueryBuilder({
    projectId,
    groupByColumn: "e.session_id",
    selectExpression: "e.session_id as sessionId, count() as count",
  })
    .where(appliedEventsFilter)
    .whereRaw("e.session_id IS NOT NULL AND length(e.session_id) > 0")
    .orderBy("ORDER BY count() DESC")
    .limit(1000, 0);

  const { query, params } = queryBuilder.buildWithParams();

  const res = await queryClickhouse<{ sessionId: string; count: number }>({
    query,
    params,
    tags: {
      feature: "tracing",
      type: "events",
      kind: "analytic",
      projectId,
    },
  });
  return res;
};

/**
 * Get grouped levels from events table
 * Used for filter options
 */
export const getEventsGroupedByLevel = async (
  projectId: string,
  filter: FilterState,
) => {
  const eventsFilter = new FilterList(
    createFilterFromFilterState(filter, eventsTableUiColumnDefinitions),
  );

  const appliedEventsFilter = eventsFilter.apply();

  // We mainly use queries like this to retrieve filter options.
  // Therefore, we can skip final as some inaccuracy in count is acceptable.
  const queryBuilder = new EventsAggQueryBuilder({
    projectId,
    groupByColumn: "e.level",
    selectExpression: "e.level as level, count() as count",
  })
    .where(appliedEventsFilter)
    .whereRaw("e.level IS NOT NULL AND length(e.level) > 0")
    .orderBy("ORDER BY count() DESC")
    .limit(1000, 0);

  const { query, params } = queryBuilder.buildWithParams();

  const res = await queryClickhouse<{ level: string; count: number }>({
    query,
    params,
    tags: {
      feature: "tracing",
      type: "events",
      kind: "analytic",
      projectId,
    },
  });
  return res;
};

/**
 * Get grouped environments from events table
 * Used for filter options
 */
export const getEventsGroupedByEnvironment = async (
  projectId: string,
  filter: FilterState,
) => {
  const eventsFilter = new FilterList(
    createFilterFromFilterState(filter, eventsTableUiColumnDefinitions),
  );

  const appliedEventsFilter = eventsFilter.apply();

  // We mainly use queries like this to retrieve filter options.
  // Therefore, we can skip final as some inaccuracy in count is acceptable.
  const queryBuilder = new EventsAggQueryBuilder({
    projectId,
    groupByColumn: "e.environment",
    selectExpression: "e.environment as environment, count() as count",
  })
    .where(appliedEventsFilter)
    .whereRaw("e.environment IS NOT NULL AND length(e.environment) > 0")
    .orderBy("ORDER BY count() DESC")
    .limit(1000, 0);

  const { query, params } = queryBuilder.buildWithParams();

  const res = await queryClickhouse<{ environment: string; count: number }>({
    query,
    params,
    tags: {
      feature: "tracing",
      type: "events",
      kind: "analytic",
      projectId,
    },
  });
  return res;
};

/**
 * Get grouped experiment dataset IDs from events table
 * Used for filter options
 */
export const getEventsGroupedByExperimentDatasetId = async (
  projectId: string,
  filter: FilterState,
) => {
  const eventsFilter = new FilterList(
    createFilterFromFilterState(filter, eventsTableUiColumnDefinitions),
  );

  const appliedEventsFilter = eventsFilter.apply();

  const queryBuilder = new EventsAggQueryBuilder({
    projectId,
    groupByColumn: "e.experiment_dataset_id",
    selectExpression:
      "e.experiment_dataset_id as experimentDatasetId, count() as count",
  })
    .where(appliedEventsFilter)
    .whereRaw(
      "e.experiment_dataset_id IS NOT NULL AND length(e.experiment_dataset_id) > 0",
    )
    .orderBy("ORDER BY count() DESC")
    .limit(1000, 0);

  const { query, params } = queryBuilder.buildWithParams();

  const res = await queryClickhouse<{
    experimentDatasetId: string;
    count: number;
  }>({
    query,
    params,
    tags: {
      feature: "tracing",
      type: "events",
      kind: "analytic",
      projectId,
    },
  });
  return res;
};

/**
 * Get grouped experiment IDs from events table
 * Used for filter options
 */
export const getEventsGroupedByExperimentId = async (
  projectId: string,
  filter: FilterState,
) => {
  const eventsFilter = new FilterList(
    createFilterFromFilterState(filter, eventsTableUiColumnDefinitions),
  );

  const appliedEventsFilter = eventsFilter.apply();

  const queryBuilder = new EventsAggQueryBuilder({
    projectId,
    groupByColumn: "e.experiment_id",
    selectExpression: "e.experiment_id as experimentId, count() as count",
  })
    .where(appliedEventsFilter)
    .whereRaw("e.experiment_id IS NOT NULL AND length(e.experiment_id) > 0")
    .orderBy("ORDER BY count() DESC")
    .limit(1000, 0);

  const { query, params } = queryBuilder.buildWithParams();

  const res = await queryClickhouse<{ experimentId: string; count: number }>({
    query,
    params,
    tags: {
      feature: "tracing",
      type: "events",
      kind: "analytic",
      projectId,
    },
  });
  return res;
};

/**
 * Get grouped experiment names from events table
 * Used for filter options
 */
export const getEventsGroupedByExperimentName = async (
  projectId: string,
  filter: FilterState,
) => {
  const eventsFilter = new FilterList(
    createFilterFromFilterState(filter, eventsTableUiColumnDefinitions),
  );

  const appliedEventsFilter = eventsFilter.apply();

  const queryBuilder = new EventsAggQueryBuilder({
    projectId,
    groupByColumn: "e.experiment_name",
    selectExpression: "e.experiment_name as experimentName, count() as count",
  })
    .where(appliedEventsFilter)
    .whereRaw("e.experiment_name IS NOT NULL AND length(e.experiment_name) > 0")
    .orderBy("ORDER BY count() DESC")
    .limit(1000, 0);

  const { query, params } = queryBuilder.buildWithParams();

  const res = await queryClickhouse<{ experimentName: string; count: number }>({
    query,
    params,
    tags: {
      feature: "tracing",
      type: "events",
      kind: "analytic",
      projectId,
    },
  });
  return res;
};

/**
 * Get grouped hasParentObservation boolean from events table
 * Used for filter options (counts for "Is Root Observation" facet)
 */
export const getEventsGroupedByHasParentObservation = async (
  projectId: string,
  filter: FilterState,
) => {
  const eventsFilter = new FilterList(
    createFilterFromFilterState(filter, eventsTableUiColumnDefinitions),
  );

  const appliedEventsFilter = eventsFilter.apply();

  const queryBuilder = new EventsAggQueryBuilder({
    projectId,
    groupByColumn: "(e.parent_span_id != '')",
    selectExpression:
      "(e.parent_span_id != '') as hasParentObservation, count() as count",
  })
    .where(appliedEventsFilter)
    .orderBy("ORDER BY hasParentObservation ASC")
    .limit(2, 0);

  const { query, params } = queryBuilder.buildWithParams();

  return queryClickhouse<{ hasParentObservation: boolean; count: number }>({
    query,
    params,
    tags: {
      feature: "tracing",
      type: "events",
      kind: "analytic",
      projectId,
    },
  });
};

/**
 * Get grouped available tool names from events table
 * Used for filter options
 */
export const getEventsGroupedByToolName = async (
  projectId: string,
  filter: FilterState,
) => {
  const eventsFilter = new FilterList(
    createFilterFromFilterState(filter, eventsTableUiColumnDefinitions),
  );

  const appliedEventsFilter = eventsFilter.apply();

  const queryBuilder = new EventsAggQueryBuilder({
    projectId,
    groupByColumn: "arrayJoin(mapKeys(e.tool_definitions))",
    selectExpression:
      "arrayJoin(mapKeys(e.tool_definitions)) as toolName, count() as count",
  })
    .where(appliedEventsFilter)
    .whereRaw("length(mapKeys(e.tool_definitions)) > 0")
    .orderBy("ORDER BY count() DESC")
    .limit(1000, 0);

  const { query, params } = queryBuilder.buildWithParams();

  const res = await queryClickhouse<{ toolName: string; count: number }>({
    query,
    params,
    tags: {
      feature: "tracing",
      type: "events",
      kind: "analytic",
      projectId,
    },
  });
  return res;
};

/**
 * Get grouped called tool names from events table
 * Used for filter options
 */
export const getEventsGroupedByCalledToolName = async (
  projectId: string,
  filter: FilterState,
) => {
  const eventsFilter = new FilterList(
    createFilterFromFilterState(filter, eventsTableUiColumnDefinitions),
  );

  const appliedEventsFilter = eventsFilter.apply();

  const queryBuilder = new EventsAggQueryBuilder({
    projectId,
    groupByColumn: "arrayJoin(e.tool_call_names)",
    selectExpression:
      "arrayJoin(e.tool_call_names) as calledToolName, count() as count",
  })
    .where(appliedEventsFilter)
    .whereRaw("length(e.tool_call_names) > 0")
    .orderBy("ORDER BY count() DESC")
    .limit(1000, 0);

  const { query, params } = queryBuilder.buildWithParams();

  const res = await queryClickhouse<{
    calledToolName: string;
    count: number;
  }>({
    query,
    params,
    tags: {
      feature: "tracing",
      type: "events",
      kind: "analytic",
      projectId,
    },
  });
  return res;
};

/**
 * Delete events by trace IDs
 * Used when traces are deleted to cascade the deletion to the events table
 */
export const deleteEventsByTraceIds = async (
  projectId: string,
  traceIds: string[],
) => {
  // Preflight query uses events_core (faster)
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
      FROM events_core
      WHERE project_id = {projectId: String} AND trace_id IN ({traceIds: Array(String)})
    `,
    params: { projectId, traceIds },
    clickhouseConfigs: {
      request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
    },
    tags: {
      feature: "tracing",
      type: "events",
      kind: "delete-preflight",
      projectId,
    },
  });

  const count = Number(preflight[0]?.cnt ?? 0);
  if (count === 0) {
    logger.info(
      `deleteEventsByTraceIds: no rows found for project ${projectId}, skipping DELETE`,
    );
    return;
  }

  const deleteParams = {
    projectId,
    traceIds,
    minTs: preflight[0].min_ts,
    maxTs: preflight[0].max_ts,
  };
  const deleteQuery = (table: string) => `
    DELETE FROM ${table}
    WHERE project_id = {projectId: String}
    AND trace_id IN ({traceIds: Array(String)})
    AND start_time >= {minTs: String}::DateTime64(3)
    AND start_time <= {maxTs: String}::DateTime64(3)
  `;
  const deleteOpts = (table: string) => ({
    query: deleteQuery(table),
    params: deleteParams,
    clickhouseConfigs: {
      request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
    },
    tags: {
      feature: "tracing",
      type: table,
      kind: "delete",
      projectId,
    },
  });

  // Delete from all tables in parallel
  await Promise.all([
    commandClickhouse(deleteOpts("events_full")),
    commandClickhouse(deleteOpts("events_core")),
    commandLegacyEventsTable(deleteOpts("events")),
  ]);
};

export const hasAnyEvent = async (projectId: string) => {
  const query = `
    SELECT 1
    FROM events_core
    WHERE project_id = {projectId: String}
    LIMIT 1
  `;

  const rows = await queryClickhouse<{ 1: number }>({
    query,
    params: { projectId },
    tags: {
      feature: "tracing",
      type: "events",
      kind: "hasAny",
      projectId,
    },
  });

  return rows.length > 0;
};

/**
 * Delete all events for a project
 * Used when an entire project is deleted
 */
export const deleteEventsByProjectId = async (
  projectId: string,
): Promise<boolean> => {
  const hasData = await hasAnyEvent(projectId);
  if (!hasData) {
    return false;
  }

  // Delete from both tables in parallel
  const deleteOpts = (table: string) => ({
    query: `DELETE FROM ${table} WHERE project_id = {projectId: String}`,
    params: { projectId },
    clickhouseConfigs: {
      request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
    },
    tags: { feature: "tracing", type: table, kind: "delete", projectId },
    clickhouseSettings: { send_logs_level: "trace" as const },
  });

  await Promise.all([
    commandClickhouse(deleteOpts("events_full")),
    commandClickhouse(deleteOpts("events_core")),
    commandLegacyEventsTable(deleteOpts("events")),
  ]);

  return true;
};

export async function getAgentGraphDataFromEventsTable(params: {
  projectId: string;
  traceId: string;
  chMinStartTime: string;
  chMaxStartTime: string;
}) {
  const { projectId, traceId, chMinStartTime, chMaxStartTime } = params;

  const query = `
    SELECT
      e.span_id as id,
      e.parent_span_id as parent_observation_id,
      e.type as type,
      e.name as name,
      e.start_time as start_time,
      e.end_time as end_time,
      mapFromArrays(e.metadata_names, e.metadata_values)['langgraph_node'] AS node,
      mapFromArrays(e.metadata_names, e.metadata_values)['langgraph_step'] AS step
    FROM events_core e
    WHERE
      e.project_id = {projectId: String}
      AND e.trace_id = {traceId: String}
      AND e.start_time >= {chMinStartTime: DateTime64(3)}
      AND e.start_time <= {chMaxStartTime: DateTime64(3)}
  `;

  return measureAndReturn({
    operationName: "getAgentGraphDataFromEventsTable",
    projectId,
    input: {
      params: { projectId, traceId, chMinStartTime, chMaxStartTime },
      tags: {
        feature: "tracing",
        type: "events",
        kind: "agentGraphData",
        projectId,
      },
    },
    fn: async (input) => {
      return queryClickhouse({
        query,
        params: input.params,
        tags: input.tags,
      });
    },
  });
}

export const hasAnyEventOlderThan = async (
  projectId: string,
  beforeDate: Date,
) => {
  const query = `
    SELECT 1
    FROM events_core
    WHERE project_id = {projectId: String}
    AND start_time < {cutoffDate: DateTime64(3)}
    LIMIT 1
  `;

  const rows = await queryClickhouse<{ 1: number }>({
    query,
    params: {
      projectId,
      cutoffDate: convertDateToClickhouseDateTime(beforeDate),
    },
    tags: {
      feature: "tracing",
      type: "events",
      kind: "hasAnyOlderThan",
      projectId,
    },
  });

  return rows.length > 0;
};

/**
 * Delete events older than a cutoff date
 * Used for data retention cleanup
 */
export const deleteEventsOlderThanDays = async (
  projectId: string,
  beforeDate: Date,
): Promise<boolean> => {
  const hasData = await hasAnyEventOlderThan(projectId, beforeDate);
  if (!hasData) {
    return false;
  }

  const deleteOpts = (table: string) => ({
    query: `
      DELETE FROM ${table}
      WHERE project_id = {projectId: String}
      AND start_time < {cutoffDate: DateTime64(3)}
    `,
    params: {
      projectId,
      cutoffDate: convertDateToClickhouseDateTime(beforeDate),
    },
    clickhouseConfigs: {
      request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
    },
    tags: { feature: "tracing", type: table, kind: "delete", projectId },
  });

  await Promise.all([
    commandClickhouse(deleteOpts("events_full")),
    commandClickhouse(deleteOpts("events_core")),
    commandLegacyEventsTable(deleteOpts("events")),
  ]);

  return true;
};

export const getObservationsBatchIOFromEventsTable = async (opts: {
  projectId: string;
  observations: Array<{
    id: string;
    traceId: string;
  }>;
  minStartTime: Date;
  maxStartTime: Date;
  truncated?: boolean; // Default true for performance, false for full data
}): Promise<
  Array<Pick<Observation, "id" | "input" | "output" | "metadata">>
> => {
  if (opts.observations.length === 0) {
    return [];
  }

  const truncated = opts.truncated ?? true;

  // Extract IDs and trace IDs for filtering
  const observationIds = opts.observations.map((o) => o.id);
  const traceIds = [...new Set(opts.observations.map((o) => o.traceId))];

  // Use provided timestamp range with buffer for efficient filtering
  const minTimestamp = new Date(opts.minStartTime.getTime() - 1000); // -1 second buffer
  const maxTimestamp = new Date(opts.maxStartTime.getTime() + 1000); // +1 second buffer

  // Use events_core for truncated reads (lightweight), events_full for full I/O
  const tableName = truncated ? "events_core" : "events_full";
  const inputSelect = truncated
    ? `leftUTF8(e.input, ${env.LANGFUSE_SERVER_SIDE_IO_CHAR_LIMIT}) as input`
    : `e.input as input`;
  const outputSelect = truncated
    ? `leftUTF8(e.output, ${env.LANGFUSE_SERVER_SIDE_IO_CHAR_LIMIT}) as output`
    : `e.output as output`;

  const query = `
    SELECT
      e.span_id as id,
      ${inputSelect},
      ${outputSelect},
      mapFromArrays(e.metadata_names, e.metadata_values) as metadata
    FROM ${tableName} e
    WHERE e.project_id = {projectId: String}
      AND e.span_id IN {observationIds: Array(String)}
      AND e.trace_id IN {traceIds: Array(String)}
      AND e.start_time >= {minTimestamp: DateTime64(3)}
      AND e.start_time <= {maxTimestamp: DateTime64(3)}
  `;

  const results = await queryClickhouse<{
    id: string;
    input: string | null;
    output: string | null;
    metadata: Record<string, string>;
  }>({
    query,
    params: {
      projectId: opts.projectId,
      observationIds,
      traceIds,
      minTimestamp: convertDateToClickhouseDateTime(minTimestamp),
      maxTimestamp: convertDateToClickhouseDateTime(maxTimestamp),
    },
    tags: {
      feature: "tracing",
      type: "events",
      kind: "batchIO",
      projectId: opts.projectId,
    },
    preferredClickhouseService: "EventsReadOnly",
  });

  return results.map((r) => ({
    id: r.id,
    input:
      r.input !== undefined
        ? applyInputOutputRendering(r.input, DEFAULT_RENDERING_PROPS)
        : null,
    output:
      r.output !== undefined
        ? applyInputOutputRendering(r.output, DEFAULT_RENDERING_PROPS)
        : null,
    metadata:
      r.metadata !== undefined ? parseMetadataCHRecordToDomain(r.metadata) : {},
  }));
};

/**
 * Column mappings for user queries from events table.
 * Includes a "Timestamp" mapping that points to start_time for compatibility
 * with the Users page filter state (which uses "Timestamp" from traces table).
 */
const usersFromEventsTableColumnDefinitions: UiColumnMappings = [
  ...eventsTableUiColumnDefinitions,
  {
    uiTableName: "Timestamp",
    uiTableId: "timestamp",
    clickhouseTableName: "events_proto",
    clickhouseSelect: 'e."start_time"',
  },
];

/**
 * Get users with trace counts from events table with pagination
 * Similar to getTracesGroupedByUsers but queries the events table
 */
export const getUsersFromEventsTable = async (
  projectId: string,
  filter: FilterState,
  searchQuery?: string,
  limit?: number,
  offset?: number,
) => {
  const eventsFilter = new FilterList(
    createFilterFromFilterState(filter, usersFromEventsTableColumnDefinitions),
  );
  const appliedEventsFilter = eventsFilter.apply();

  const queryBuilder = new EventsAggQueryBuilder({
    projectId,
    groupByColumn: "e.user_id",
    selectExpression: "e.user_id as user, uniq(e.trace_id) as count",
  })
    .where(appliedEventsFilter)
    .whereRaw("e.user_id IS NOT NULL AND length(e.user_id) > 0")
    .whereRaw("e.is_deleted = 0")
    .when(Boolean(searchQuery), (b) =>
      b.whereRaw("e.user_id ILIKE {searchQuery: String}", {
        searchQuery: `%${searchQuery}%`,
      }),
    )
    .orderBy("ORDER BY count DESC")
    .limit(limit, offset);

  const { query, params } = queryBuilder.buildWithParams();

  return queryClickhouse<{ user: string; count: string }>({
    query,
    params,
    tags: {
      feature: "users",
      type: "events",
      kind: "analytic",
      projectId,
    },
  });
};

/**
 * Get total user count from events table
 */
export const getUsersCountFromEventsTable = async (
  projectId: string,
  filter: FilterState,
  searchQuery?: string,
): Promise<{ totalCount: string }[]> => {
  const eventsFilter = new FilterList(
    createFilterFromFilterState(filter, usersFromEventsTableColumnDefinitions),
  );
  const appliedEventsFilter = eventsFilter.apply();

  const searchCondition = searchQuery
    ? `AND e.user_id ILIKE {searchQuery: String}`
    : "";

  const query = `
    SELECT uniq(e.user_id) AS totalCount
    FROM events_core e
    WHERE e.project_id = {projectId: String}
    AND e.user_id IS NOT NULL
    AND e.user_id != ''
    AND e.is_deleted = 0
    ${appliedEventsFilter.query ? `AND ${appliedEventsFilter.query}` : ""}
    ${searchCondition}
  `;

  return queryClickhouse<{ totalCount: string }>({
    query,
    params: {
      projectId,
      ...appliedEventsFilter.params,
      ...(searchQuery ? { searchQuery: `%${searchQuery}%` } : {}),
    },
    tags: {
      feature: "users",
      type: "events",
      kind: "analytic",
      projectId,
    },
  });
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

  const eventsFilter = new FilterList(
    createFilterFromFilterState(filter, usersFromEventsTableColumnDefinitions),
  );
  const appliedEventsFilter = eventsFilter.apply();

  const statsBuilder = new EventsAggQueryBuilder({
    projectId,
    groupByColumn: "e.user_id",
    selectExpression: `
      e.user_id as user_id,
      anyLast(e.environment) as environment,
      count(DISTINCT e.span_id) as obs_count,
      count(DISTINCT e.trace_id) as trace_count,
      sumMap(e.usage_details) as sum_usage_details,
      sum(e.total_cost) as sum_total_cost,
      min(e.start_time) as min_timestamp,
      max(e.start_time) as max_timestamp
    `,
  })
    .whereRaw("e.user_id IN ({userIds: Array(String)})", { userIds })
    // not required if called from tRPC (user_id is always defined), left in for safety only
    .whereRaw("e.user_id IS NOT NULL AND length(e.user_id) > 0")
    .whereRaw("e.is_deleted = 0")
    .where(appliedEventsFilter);

  const { query: statsQuery, params: statsParams } =
    statsBuilder.buildWithParams();

  const query = `
    WITH stats AS (${statsQuery})
    SELECT
      user_id,
      environment,
      obs_count,
      trace_count,
      sum_total_cost,
      min_timestamp,
      max_timestamp,
      arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'input') > 0, sum_usage_details))) as input_usage,
      arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, sum_usage_details))) as output_usage,
      sum_usage_details['total'] as total_usage
    FROM stats
  `;

  const rows = await queryClickhouse<{
    user_id: string;
    environment: string;
    max_timestamp: string;
    min_timestamp: string;
    input_usage: string;
    output_usage: string;
    total_usage: string;
    obs_count: string;
    trace_count: string;
    sum_total_cost: string;
  }>({
    query,
    params: statsParams,
    tags: {
      feature: "users",
      type: "events",
      kind: "analytic",
      projectId,
    },
  });

  return rows.map((row) => ({
    userId: row.user_id,
    environment: row.environment,
    maxTimestamp: parseClickhouseUTCDateTimeFormat(row.max_timestamp),
    minTimestamp: parseClickhouseUTCDateTimeFormat(row.min_timestamp),
    inputUsage: Number(row.input_usage),
    outputUsage: Number(row.output_usage),
    totalUsage: Number(row.total_usage),
    observationCount: Number(row.obs_count),
    traceCount: Number(row.trace_count),
    totalCost: Number(row.sum_total_cost),
  }));
};

/**
 * Check if any user exists in events table
 * Uses hasAnyEvent pattern but filters for user_id
 */
export const hasAnyUserFromEventsTable = async (
  projectId: string,
): Promise<boolean> => {
  // Filter out deleted rows
  const query = `
    SELECT 1
    FROM events_core
    WHERE project_id = {projectId: String}
    AND user_id IS NOT NULL
    AND user_id != ''
    AND is_deleted = 0
    LIMIT 1
  `;

  const rows = await queryClickhouse<{ 1: number }>({
    query,
    params: { projectId },
    tags: {
      feature: "users",
      type: "events",
      kind: "hasAny",
      projectId,
    },
  });

  return rows.length > 0;
};

/**
 * Streams events from ClickHouse for blob storage export.
 * Uses EventsQueryBuilder for consistent query construction.
 */
export const getEventsForBlobStorageExport = function (
  projectId: string,
  minTimestamp: Date,
  maxTimestamp: Date,
) {
  const queryBuilder = new EventsQueryBuilder({ projectId })
    .selectFieldSet("export")
    .selectIO(false) // Full I/O, no truncation
    .selectFieldSet("metadata")
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
      "mapFromArrays(e.metadata_names, e.metadata_prefixes)['$posthog_session_id'] as posthog_session_id",
      "mapFromArrays(e.metadata_names, e.metadata_prefixes)['$mixpanel_session_id'] as mixpanel_session_id",
    )
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
  const query = `
    SELECT 1
    FROM events_core
    WHERE project_id = {projectId: String}
    AND session_id IS NOT NULL
    AND session_id != ''
    AND is_deleted = 0
    LIMIT 1
  `;

  const rows = await measureAndReturn({
    operationName: "hasAnySessionFromEventsTable",
    projectId,
    input: { params: { projectId } },
    fn: async (input) => {
      return queryClickhouse<{ 1: number }>({
        query,
        params: input.params,
        tags: {
          feature: "sessions",
          type: "events",
          kind: "hasAny",
          projectId,
        },
      });
    },
  });

  return rows.length > 0;
};

/**
 * Fetch trace metadata (name, user_id, tags) for a list of trace IDs.
 * Used by the scores table to enrich score rows with trace-level data.
 */
export const getTraceMetadataByIdsFromEvents = async (props: {
  projectId: string;
  traceIds: string[];
}) => {
  if (props.traceIds.length === 0) return [];

  const builder = eventsTraceMetadata(props.projectId).whereRaw(
    "e.trace_id IN ({traceIds: Array(String)})",
    { traceIds: props.traceIds },
  );

  const { query, params } = builder.buildWithParams();

  return measureAndReturn({
    operationName: "getTraceMetadataByIdsFromEvents",
    projectId: props.projectId,
    input: {
      params,
      tags: {
        feature: "tracing",
        type: "trace-metadata",
        projectId: props.projectId,
      },
    },
    fn: async (input) =>
      queryClickhouse<{
        id: string;
        name: string;
        user_id: string;
        tags: string[];
      }>({
        query,
        params: input.params,
        tags: input.tags,
      }),
  });
};

export const getAvgCostByEvaluatorIds = async (
  projectId: string,
  evaluatorIds: string[],
): Promise<
  Array<{ evaluatorId: string; avgCost: number; executionCount: number }>
> => {
  if (evaluatorIds.length === 0) return [];

  const builder = new EventsAggQueryBuilder({
    projectId,
    groupByColumn:
      "mapFromArrays(e.metadata_names, e.metadata_values)['job_configuration_id']",
    selectExpression: [
      "mapFromArrays(e.metadata_names, e.metadata_values)['job_configuration_id'] as evaluator_id",
      "avg(e.total_cost) as avg_cost",
      "count(*) as execution_count",
    ].join(", "),
  })
    .whereRaw("e.type = 'GENERATION'")
    .whereRaw("has(e.metadata_names, 'job_configuration_id')")
    .whereRaw(
      "mapFromArrays(e.metadata_names, e.metadata_values)['job_configuration_id'] IN ({evaluatorIds: Array(String)})",
      { evaluatorIds },
    )
    .whereRaw("e.start_time > today() - 7");

  const { query, params } = builder.buildWithParams();

  const rows = await queryClickhouse<{
    evaluator_id: string;
    avg_cost: string;
    execution_count: string;
  }>({
    query,
    params,
    tags: {
      feature: "evals",
      type: "events",
      kind: "analytic",
      projectId,
    },
  });

  return rows.map((row) => ({
    evaluatorId: row.evaluator_id,
    avgCost: Number(row.avg_cost),
    executionCount: Number(row.execution_count),
  }));
};

export const getSessionMetricsFromEvents = async (props: {
  projectId: string;
  sessionIds: string[];
  queryFromTimestamp?: Date;
}) => {
  if (props.sessionIds.length === 0) return [];

  const builder = eventsSessionsAggregation({
    projectId: props.projectId,
    sessionIds: props.sessionIds,
    startTimeFrom: props.queryFromTimestamp
      ? convertDateToClickhouseDateTime(props.queryFromTimestamp)
      : undefined,
  }).limit(props.sessionIds.length);

  const { query, params } = builder.buildWithParams();

  const rows = await measureAndReturn({
    operationName: "getSessionMetricsFromEvents",
    projectId: props.projectId,
    input: {
      params,
      tags: {
        feature: "tracing",
        type: "session-metrics-direct",
        projectId: props.projectId,
      },
    },
    fn: async (input) =>
      queryClickhouse<SessionEventsMetricsRow>({
        query,
        params: input.params,
        tags: input.tags,
      }),
  });

  return rows.map((row) => ({
    ...row,
    trace_count: Number(row.trace_count),
    total_observations: Number(row.total_observations),
  }));
};
