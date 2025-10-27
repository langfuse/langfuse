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
  DateTimeFilter,
  FilterList,
  FullObservations,
  orderByToClickhouseSql,
  createPublicApiObservationsColumnMapping,
  deriveFilters,
  type ApiColumnMapping,
  ObservationPriceFields,
} from "../queries";
import { createFilterFromFilterState } from "../queries/clickhouse-sql/factory";
import type { FilterState } from "../../types";
import {
  eventsScoresAggregation,
  eventsTracesAggregation,
} from "../queries/clickhouse-sql/query-fragments";
import { clickhouseSearchCondition } from "../queries/clickhouse-sql/search";
import {
  eventsTableLegacyTraceUiColumnDefinitions,
  eventsTableUiColumnDefinitions,
} from "../tableMappings/mapEventsTable";
import { DEFAULT_RENDERING_PROPS, RenderingProps } from "../utils/rendering";
import { queryClickhouse } from "./clickhouse";
import { ObservationRecordReadType } from "./definitions";
import {
  ObservationsTableQueryResult,
  ObservationTableQuery,
} from "./observations";
import { convertObservation } from "./observations_converters";
import { EventsQueryBuilder } from "../queries/clickhouse-sql/event-query-builder";

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
const extractTimeFilter = (filter: FilterList): string | null => {
  const timeFilter = filter.find(
    (f) =>
      f.clickhouseTable === "events" &&
      f.field === "start_time" &&
      (f.operator === ">=" || f.operator === ">"),
  );

  return timeFilter
    ? convertDateToClickhouseDateTime((timeFilter as DateTimeFilter).value)
    : null;
};

/**
 * Column mapping for public API filters on events table
 */
const PUBLIC_API_EVENTS_COLUMN_MAPPING: ApiColumnMapping[] =
  createPublicApiObservationsColumnMapping("events", "e", "parent_span_id");

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
    f.column.toLowerCase().includes("scores"),
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

  // When we have default ordering by time, we order by toUnixTimestamp(e.start_time)
  // This way, clickhouse is able to read more efficiently directly from disk without ordering
  const newDefaultOrder =
    orderBy?.column === "startTime"
      ? [{ column: "order_by_unix", order: orderBy.order }]
      : [orderBy ?? null];

  const chOrderBy = orderByToClickhouseSql(newDefaultOrder, [
    ...eventsTableUiColumnDefinitions,
    {
      uiTableName: "order_by_unix",
      uiTableId: "order_by_unix",
      clickhouseTableName: "events",
      clickhouseSelect: "toUnixTimestamp(e.start_time)",
    },
  ]);

  // Build query using EventsQueryBuilder
  const queryBuilder = new EventsQueryBuilder({ projectId });

  if (opts.select === "count") {
    queryBuilder.selectFieldSet("count");
  } else {
    queryBuilder.selectFieldSet("base", "calculated");
    if (selectIOAndMetadata) {
      queryBuilder.selectFieldSet("io", "metadata");
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
  // Build query using EventsQueryBuilder with automatic param tracking
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
    .orderBy("ORDER BY toUnixTimestamp(start_time) DESC, event_ts DESC")
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
      .orderBy("ORDER BY toUnixTimestamp(e.start_time) DESC")
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
