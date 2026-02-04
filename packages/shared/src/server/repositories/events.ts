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
} from "./clickhouse";
import { ObservationRecordReadType, TraceRecordReadType } from "./definitions";
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
} from "../queries/clickhouse-sql/event-query-builder";
import { type EventsObservationPublic } from "../queries/createGenerationsQuery";
import { UiColumnMappings } from "../../tableDefinitions";
import { parseMetadataCHRecordToDomain } from "../utils/metadata_conversion";

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
      traceName: o.name ?? null,
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
  tableName: "events" | "traces" = "events",
  fieldName: "start_time" | "timestamp" = "start_time",
): string | null {
  const timeFilter = filter.find(
    (f) =>
      f.clickhouseTable === tableName &&
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
  createPublicApiObservationsColumnMapping("events", "e", "parent_span_id");

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

  // Build filter list
  const observationsFilter = new FilterList(
    createFilterFromFilterState(filter, eventsTableUiColumnDefinitions),
  );

  const startTimeFrom = extractTimeFilter(observationsFilter);
  const hasScoresFilter = filter.some((f) =>
    f.column.toLowerCase().includes("score"),
  );
  const appliedObservationsFilter = observationsFilter.apply();
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
    .where(appliedObservationsFilter)
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
  const tracesBuilder = eventsTracesAggregation({
    projectId,
    traceIds: [traceId],
    startTimeFrom: fromTimestamp
      ? convertDateToClickhouseDateTime(fromTimestamp)
      : null,
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
  if (renderingProps.truncated) {
    queryBuilder
      .select(
        `leftUTF8(t.input_truncated, ${env.LANGFUSE_SERVER_SIDE_IO_CHAR_LIMIT}) as input`,
      )
      .select(
        `leftUTF8(t.output_truncated, ${env.LANGFUSE_SERVER_SIDE_IO_CHAR_LIMIT}) as output`,
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

function buildObservationsQueryBase(
  opts: PublicApiObservationsQuery,
  columnDefinitions: UiColumnMappings = eventsTableNativeUiColumnDefinitions,
): EventsQueryBuilder {
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

  // Build query with common CTE, joins, and filters
  const queryBuilder = new EventsQueryBuilder({ projectId })
    .when(hasTraceFilter, (b) =>
      b.withCTE(
        "traces",
        eventsTracesAggregation({ projectId, startTimeFrom }).buildWithParams(),
      ),
    )
    .when(hasTraceFilter, (b) =>
      b.leftJoin(
        "traces t",
        "ON t.id = e.trace_id AND t.project_id = e.project_id",
      ),
    )
    .where(appliedFilter);

  return queryBuilder;
}

function applyOrderByForObservationsQuery(
  queryBuilder: EventsQueryBuilder,
): EventsQueryBuilder {
  return (
    queryBuilder
      // Order by to match table ordering
      .orderByColumns([
        { column: "e.start_time", direction: "DESC" },
        { column: "xxHash32(e.trace_id)", direction: "DESC" },
        { column: "e.span_id", direction: "DESC" },
      ])
  );
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
  queryBuilder: EventsQueryBuilder,
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
 */
export const getObservationsV2FromEventsTableForPublicApi = async (
  opts: PublicApiObservationsQuery & { fields: ObservationFieldGroup[] },
): Promise<Array<EventsObservationPublic>> => {
  const { projectId, expandMetadataKeys } = opts;

  // Build query with filters and common CTEs
  let queryBuilder = buildObservationsQueryBase(
    opts,
    eventsTableNativeUiColumnDefinitions,
  );

  // Determine which field groups to include
  // If fields are not specified (null), include "default" groups: core + basic
  const requestedFields = opts.fields ?? ["core", "basic"];

  // Core fields are always included (required for cursor pagination)
  queryBuilder.selectFieldSet("core");

  // Conditionally add other field sets based on requested groups
  requestedFields
    .filter((fg) => fg !== "core")
    .forEach((fieldGroup) => {
      queryBuilder.selectFieldSet(fieldGroup);
    });

  // Handle metadata field with optional expansion
  if (requestedFields.includes("metadata")) {
    if (expandMetadataKeys && expandMetadataKeys.length > 0) {
      // Use expanded metadata (coalesces truncated values with full values)
      queryBuilder.selectMetadataExpanded(expandMetadataKeys);
    }
  }

  queryBuilder = applyCursorPagination(
    opts,
    applyOrderByForObservationsQuery(queryBuilder),
  );

  const observationRecords =
    await getObservationsRowsFromBuilder<ObservationsTableQueryResultWitouhtTraceFields>(
      projectId,
      queryBuilder,
    );

  return await enrichObservationsWithModelData(
    observationRecords,
    opts.projectId,
    Boolean(opts.parseIoAsJson),
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
  const tracesBuilder = eventsTracesAggregation({
    projectId,
    startTimeFrom,
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
  const query = `
  	UPDATE events SET ${setClauses.join(", ")}
    WHERE project_id = {projectId: String}
    ${selector.spanIds ? "AND span_id IN ({spanIds: Array(String)})" : ""}
		${selector.traceIds ? "AND trace_id IN ({traceIds: Array(String)})" : ""}
		${selector.rootOnly === true ? "AND parent_span_id = ''" : ""}
	`;
  return await commandClickhouse({
    query: query,
    params: {
      projectId,
      spanIds: selector.spanIds ?? [],
      traceIds: selector.traceIds ?? [],
      ...updates,
    },
    tags: {
      type: "event",
      kind: "update",
      projectId,
    },
  });
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
 * NOTE: Uses raw SQL instead of EventsAggQueryBuilder because:
 * - arrayJoin() explodes arrays into rows, requiring DISTINCT (not GROUP BY)
 * - EventsAggQueryBuilder always emits GROUP BY, which changes semantics
 * - We want unique tag values, not tag occurrence counts
 */
export const getEventsGroupedByTraceTags = async (
  projectId: string,
  filter: FilterState,
) => {
  const eventsFilter = new FilterList(
    createFilterFromFilterState(filter, eventsTableUiColumnDefinitions),
  );

  const appliedEventsFilter = eventsFilter.apply();

  const query = `
    SELECT DISTINCT arrayJoin(e.tags) as tag
    FROM events e
    WHERE e.project_id = {projectId: String}
    AND e.is_deleted = 0
    ${appliedEventsFilter.query ? `AND ${appliedEventsFilter.query}` : ""}
    AND notEmpty(e.tags)
    ORDER BY tag ASC
    LIMIT 1000
  `;

  return measureAndReturn({
    operationName: "getEventsGroupedByTraceTags",
    projectId,
    input: { params: { projectId, ...appliedEventsFilter.params } },
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
 * Delete events by trace IDs
 * Used when traces are deleted to cascade the deletion to the events table
 */
export const deleteEventsByTraceIds = async (
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
      FROM events
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

  await commandClickhouse({
    query: `
      DELETE FROM events
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
      type: "events",
      kind: "delete",
      projectId,
    },
  });
};

export const hasAnyEvent = async (projectId: string) => {
  const query = `
    SELECT 1
    FROM events
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

  const query = `
    DELETE FROM events
    WHERE project_id = {projectId: String};
  `;
  const tags = {
    feature: "tracing",
    type: "events",
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
    clickhouseSettings: {
      send_logs_level: "trace",
    },
  });

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
      mapFromArrays(e.metadata_names, e.metadata_prefixes)['langgraph_node'] AS node,
      mapFromArrays(e.metadata_names, e.metadata_prefixes)['langgraph_step'] AS step
    FROM events e
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
    FROM events
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

  const query = `
    DELETE FROM events
    WHERE project_id = {projectId: String}
    AND start_time < {cutoffDate: DateTime64(3)};
  `;
  await commandClickhouse({
    query,
    params: {
      projectId,
      cutoffDate: convertDateToClickhouseDateTime(beforeDate),
    },
    clickhouseConfigs: {
      request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
    },
    tags: {
      feature: "tracing",
      type: "events",
      kind: "delete",
      projectId,
    },
  });

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
      mapFromArrays(e.metadata_names, e.metadata_prefixes) as metadata
    FROM events e
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
    clickhouseTableName: "events",
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
    FROM events e
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
    FROM events
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
 * Check if any session exists in events table
 * Filters for non-empty session_id
 */
export const hasAnySessionFromEventsTable = async (
  projectId: string,
): Promise<boolean> => {
  const query = `
    SELECT 1
    FROM events
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
