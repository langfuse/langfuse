import { prisma } from "../../db";
import { Observation, ObservationType } from "../../domain";
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
  FullObservations,
  orderByToClickhouseSql,
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
  eventsTableLegacyTraceUiColumnDefinitions,
  eventsTableUiColumnDefinitions,
} from "../tableMappings/mapEventsTable";
import { tracesTableUiColumnDefinitions } from "../tableMappings/mapTracesTable";
import { DEFAULT_RENDERING_PROPS, RenderingProps } from "../utils/rendering";
import { commandClickhouse, queryClickhouse } from "./clickhouse";
import { ObservationRecordReadType, TraceRecordReadType } from "./definitions";
import {
  ObservationsTableQueryResult,
  ObservationTableQuery,
} from "./observations";
import { convertObservation } from "./observations_converters";
import {
  EventsQueryBuilder,
  CTEQueryBuilder,
  EventsAggQueryBuilder,
} from "../queries/clickhouse-sql/event-query-builder";

type ObservationsTableQueryResultWitouhtTraceFields = Omit<
  ObservationsTableQueryResult,
  "trace_tags" | "trace_name" | "trace_user_id"
>;

/**
 * Internal helper: enrich observations with model pricing data
 */
const enrichObservationsWithModelData = async (
  observationRecords: Array<ObservationsTableQueryResultWitouhtTraceFields>,
  projectId: string,
): Promise<Array<Observation & ObservationPriceFields>> => {
  const uniqueModels: string[] = Array.from(
    new Set(
      observationRecords
        .map((r) => r.internal_model_id)
        .filter((r): r is string => Boolean(r)),
    ),
  );

  const models =
    uniqueModels.length > 0
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

  return observationRecords.map((o) => {
    const model = models.find((m) => m.id === o.internal_model_id);
    return {
      ...convertObservation(o),
      latency: o.latency ? Number(o.latency) / 1000 : null,
      timeToFirstToken: o.time_to_first_token
        ? Number(o.time_to_first_token) / 1000
        : null,
      modelId: model?.id ?? null,
      inputPrice:
        model?.Price?.find((m) => m.usageType === "input")?.price ?? null,
      outputPrice:
        model?.Price?.find((m) => m.usageType === "output")?.price ?? null,
      totalPrice:
        model?.Price?.find((m) => m.usageType === "total")?.price ?? null,
    };
  });
};

const enrichObservationsWithTraceFields = async (
  observationRecords: Array<Observation & ObservationPriceFields>,
): Promise<FullObservations> => {
  return observationRecords.map((o) => {
    return {
      ...o,
      traceName: o.name ?? null,
      traceTags: [], // TODO pull from PG
      traceTimestamp: null,
    };
  });
};

/**
 * Internal helper: extract and convert time filter from FilterList
 * Common pattern: find time filter and convert to ClickHouse DateTime format
 */
const extractTimeFilter = (
  filter: FilterList,
  tableName: "events" | "traces" = "events",
  fieldName: "start_time" | "timestamp" = "start_time",
): string | null => {
  const timeFilter = filter.find(
    (f) =>
      f.clickhouseTable === tableName &&
      f.field === fieldName &&
      (f.operator === ">=" || f.operator === ">"),
  );

  return timeFilter
    ? convertDateToClickhouseDateTime((timeFilter as DateTimeFilter).value)
    : null;
};

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

const TRACES_FROM_EVENTS_UI_COLUMN_DEFINITIONS = tracesTableUiColumnDefinitions;

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
): Promise<FullObservations> => {
  const observationRecords =
    await getObservationsFromEventsTableInternal<ObservationsTableQueryResultWitouhtTraceFields>(
      {
        ...opts,
        select: "rows",
        tags: { kind: "list" },
      },
    );

  return enrichObservationsWithTraceFields(
    await enrichObservationsWithModelData(observationRecords, opts.projectId),
  );
};

const getObservationsFromEventsTableInternal = async <T>(
  opts: ObservationTableQuery & {
    select: "count" | "rows";
    tags: Record<string, string>;
  },
): Promise<Array<T>> => {
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
  );

  // Query optimization: joining traces onto observations is expensive.
  // Hence, only join if the UI table contains filters on traces.
  const traceTableFilter = filter.filter((f) =>
    eventsTableLegacyTraceUiColumnDefinitions.some(
      (c) => c.uiTableId === f.column || c.uiTableName === f.column,
    ),
  );
  const orderByTraces = orderBy
    ? eventsTableLegacyTraceUiColumnDefinitions.some(
        (c) =>
          c.uiTableId === orderBy.column || c.uiTableName === orderBy.column,
      )
    : undefined;
  const needsTraceJoin =
    traceTableFilter.length > 0 || orderByTraces || search.query;

  const chOrderBy = orderByToClickhouseSql(
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
    .orderBy(chOrderBy)
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
};

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
    preferredClickhouseService,
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

const getObservationByIdFromEventsTableInternal = async ({
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
    .orderBy("ORDER BY start_time DESC, event_ts DESC")
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
};

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
};

/**
 * Internal implementation for public API observations queries.
 * Consolidates count and list queries into a single implementation.
 */
const getObservationsFromEventsTableForPublicApiInternal = async <T>(
  opts: PublicApiObservationsQuery & { select: "rows" | "count" },
): Promise<Array<T>> => {
  const { projectId, page, limit, advancedFilters, ...filterParams } = opts;

  // Convert and merge simple and advanced filters
  const observationsFilter = deriveFilters(
    { ...filterParams, projectId, page, limit },
    PUBLIC_API_EVENTS_COLUMN_MAPPING,
    advancedFilters,
    eventsTableUiColumnDefinitions,
  );

  // Determine if we need to join traces (for userId filter)
  const hasTraceFilter = Boolean(filterParams.userId);

  // Extract time filter using helper
  const startTimeFrom = extractTimeFilter(observationsFilter);
  const appliedFilter = observationsFilter.apply();

  // Build query using EventsQueryBuilder
  const queryBuilder = new EventsQueryBuilder({ projectId });

  if (opts.select === "count") {
    queryBuilder.selectFieldSet("count");
  } else {
    queryBuilder.selectFieldSet("base", "calculated", "io", "metadata");
  }

  queryBuilder
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

  if (opts.select === "rows") {
    queryBuilder
      .orderBy("ORDER BY e.start_time DESC")
      .limit(limit, (page - 1) * limit);
  }

  const { query, params } = queryBuilder.buildWithParams();

  const result = await measureAndReturn({
    operationName: `getObservationsFromEventsTableForPublicApi_${opts.select}`,
    projectId,
    input: {
      params,
      tags: {
        feature: "tracing",
        type: "events",
        kind: opts.select === "count" ? "publicApiCount" : "publicApiRows",
        projectId,
      },
    },
    fn: async (input) => {
      return await queryClickhouse<T>({
        query,
        params: input.params,
        tags: input.tags,
        preferredClickhouseService: "ReadOnly",
      });
    },
  });

  return result;
};

/**
 * Get observations list from events table for public API.
 * Includes model enrichment and supports public API filter format.
 */
export const getObservationsFromEventsTableForPublicApi = async (
  opts: PublicApiObservationsQuery,
): Promise<Array<Observation & ObservationPriceFields>> => {
  const observationRecords =
    await getObservationsFromEventsTableForPublicApiInternal<ObservationsTableQueryResultWitouhtTraceFields>(
      {
        ...opts,
        select: "rows",
      },
    );
  return enrichObservationsWithModelData(observationRecords, opts.projectId);
};

/**
 * Get count of observations from events table for public API.
 */
export const getObservationsCountFromEventsTableForPublicApi = async (
  opts: PublicApiObservationsQuery,
): Promise<number> => {
  const countResult = await getObservationsFromEventsTableForPublicApiInternal<{
    count: string;
  }>({
    ...opts,
    select: "count",
  });
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
const getTracesFromEventsTableForPublicApiInternal = async <T>(
  opts: PublicApiTracesQuery & { select: "rows" | "count" },
): Promise<Array<T>> => {
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

  if (includeScores) {
    const scoresCTE = eventsTracesScoresAggregation({
      projectId,
      startTimeFrom,
    });
    queryBuilder = queryBuilder
      .withCTE("score_stats", {
        ...scoresCTE,
        schema: ["trace_id", "project_id", "score_ids"],
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
      ) || "ORDER BY t.timestamp DESC";

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
        preferredClickhouseService: "ReadOnly",
      });
    },
  });

  return result;
};

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
  // eslint-disable-next-line no-unused-vars
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
