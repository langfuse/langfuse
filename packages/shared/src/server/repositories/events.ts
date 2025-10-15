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
  StringFilter,
  convertApiProvidedFilterToClickhouseFilter,
  type ApiColumnMapping,
  ObservationPriceFields,
} from "../queries";
import { createFilterFromFilterState } from "../queries/clickhouse-sql/factory";
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
const PUBLIC_API_EVENTS_COLUMN_MAPPING: ApiColumnMapping[] = [
  {
    id: "userId",
    clickhouseSelect: "user_id",
    filterType: "StringFilter",
    clickhouseTable: "traces",
    clickhousePrefix: "t",
  },
  {
    id: "traceId",
    clickhouseSelect: "trace_id",
    filterType: "StringFilter",
    clickhouseTable: "events",
    clickhousePrefix: "e",
  },
  {
    id: "name",
    clickhouseSelect: "name",
    filterType: "StringFilter",
    clickhouseTable: "events",
    clickhousePrefix: "e",
  },
  {
    id: "level",
    clickhouseSelect: "level",
    filterType: "StringFilter",
    clickhouseTable: "events",
    clickhousePrefix: "e",
  },
  {
    id: "type",
    clickhouseSelect: "type",
    filterType: "StringFilter",
    clickhouseTable: "events",
    clickhousePrefix: "e",
  },
  {
    id: "parentObservationId",
    clickhouseSelect: "parent_span_id",
    filterType: "StringFilter",
    clickhouseTable: "events",
    clickhousePrefix: "e",
  },
  {
    id: "fromStartTime",
    clickhouseSelect: "start_time",
    operator: ">=",
    filterType: "DateTimeFilter",
    clickhouseTable: "events",
    clickhousePrefix: "e",
  },
  {
    id: "toStartTime",
    clickhouseSelect: "start_time",
    operator: "<",
    filterType: "DateTimeFilter",
    clickhouseTable: "events",
    clickhousePrefix: "e",
  },
  {
    id: "version",
    clickhouseSelect: "version",
    filterType: "StringFilter",
    clickhouseTable: "events",
    clickhousePrefix: "e",
  },
  {
    id: "environment",
    clickhouseSelect: "environment",
    filterType: "StringFilter",
    clickhouseTable: "events",
    clickhousePrefix: "e",
  },
];

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
  const select =
    opts.select === "count"
      ? "count(*) as count"
      : `
        e.span_id as id,
        e.type as type,
        e.project_id as "project_id",
        e.name as name,
        e."model_parameters" as model_parameters,
        e.start_time as "start_time",
        e.end_time as "end_time",
        e.trace_id as "trace_id",
        e.completion_start_time as "completion_start_time",
        e.provided_usage_details as "provided_usage_details",
        e.usage_details as "usage_details",
        e.provided_cost_details as "provided_cost_details",
        e.cost_details as "cost_details",
        e.level as level,
        e.environment as "environment",
        e.status_message as "status_message",
        e.version as version,
        e.parent_span_id as "parent_observation_id",
        e.created_at as "created_at",
        e.updated_at as "updated_at",
        e.provided_model_name as "provided_model_name",
        e.total_cost as "total_cost",
        e.prompt_id as "prompt_id",
        e.prompt_name as "prompt_name",
        e.prompt_version as "prompt_version",
        e.model_id as "internal_model_id",
        if(isNull(end_time), NULL, date_diff('millisecond', start_time, end_time)) as latency,
        if(isNull(completion_start_time), NULL,  date_diff('millisecond', start_time, completion_start_time)) as "time_to_first_token"`;

  const {
    projectId,
    filter,
    selectIOAndMetadata,
    limit,
    offset,
    orderBy,
    clickhouseConfigs,
  } = opts;

  const selectString = selectIOAndMetadata
    ? `${select}, e.input, e.output, e.metadata`
    : select;

  const observationsFilter = new FilterList([
    new StringFilter({
      clickhouseTable: "events",
      field: "project_id",
      operator: "=",
      value: projectId,
      tablePrefix: "e",
    }),
  ]);

  observationsFilter.push(
    ...createFilterFromFilterState(filter, eventsTableUiColumnDefinitions),
  );

  const startTimeFrom = extractTimeFilter(observationsFilter);

  const hasScoresFilter = filter.some((f) =>
    f.column.toLowerCase().includes("scores"),
  );

  const scoresParams = hasScoresFilter
    ? {
        projectId: projectId,
        startTimeFrom: startTimeFrom,
      }
    : {};

  const appliedObservationsFilter = observationsFilter.apply();

  const search = clickhouseSearchCondition(
    opts.searchQuery,
    opts.searchType,
    "e",
  );

  // Query optimisation: joining traces onto observations is expensive.
  // Hence, only join if the UI table contains filters on traces.
  // Joins with traces are very expensive. We need to filter by time as well.
  // We assume that a trace has to have been within the last 2 days to be relevant.
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

  // Build CTEs - only include what's needed
  const ctes: string[] = [];
  if (hasScoresFilter) {
    ctes.push(
      eventsScoresAggregation({
        projectId,
        startTimeFrom,
      }),
    );
  }

  if (traceTableFilter.length > 0 || orderByTraces || search.query) {
    ctes.push(
      `traces AS (${eventsTracesAggregation({
        projectId,
        startTimeFrom,
      })})`,
    );
  }

  // When we have default ordering by time, we order by toUnixTimestamp(o.start_time)
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

  const query = `
      ${ctes.length > 0 ? `WITH ${ctes.join(",\n")}` : ""}
      SELECT
       ${selectString}
      FROM events e
        ${
          traceTableFilter.length > 0 || orderByTraces || search.query
            ? "LEFT JOIN traces t ON t.id = e.trace_id AND t.project_id = e.project_id"
            : ""
        }
        ${hasScoresFilter ? `LEFT JOIN scores_agg AS s ON s.trace_id = e.trace_id and s.observation_id = e.span_id` : ""}
      WHERE ${appliedObservationsFilter.query}
        ${search.query}
      ${chOrderBy}
      ${limit !== undefined && offset !== undefined ? `LIMIT ${limit} OFFSET ${offset}` : "LIMIT 1000"};`;

  return measureAndReturn({
    operationName: "getObservationsFromEventsTableInternal",
    projectId,
    input: {
      params: {
        projectId,
        startTimeFrom,
        ...scoresParams,
        ...appliedObservationsFilter.params,
        ...search.params,
      },
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
  const query = `
  SELECT
    span_id as id,
    trace_id,
    project_id,
    environment,
    type,
    parent_span_id as parent_observation_id,
    start_time,
    end_time,
    name,
    metadata,
    level,
    status_message,
    version,
    ${fetchWithInputOutput ? (renderingProps.truncated ? `leftUTF8(input, ${env.LANGFUSE_SERVER_SIDE_IO_CHAR_LIMIT}) as input, leftUTF8(output, ${env.LANGFUSE_SERVER_SIDE_IO_CHAR_LIMIT}) as output,` : "input, output,") : ""}
    provided_model_name,
    model_id as internal_model_id,
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
  FROM events
  WHERE span_id = {id: String}
  AND project_id = {projectId: String}
  ${startTime ? `AND toDate(start_time) = toDate({startTime: DateTime64(3)})` : ""}
  ${type ? `AND type = {type: String}` : ""}
  ${traceId ? `AND trace_id = {traceId: String}` : ""}
  ORDER BY toUnixTimestamp(start_time) DESC, event_ts DESC
  LIMIT 1`;
  return await queryClickhouse<ObservationRecordReadType>({
    query,
    params: {
      id,
      projectId,
      ...(startTime
        ? { startTime: convertDateToClickhouseDateTime(startTime) }
        : {}),
      ...(type ? { type } : {}),
      ...(traceId ? { traceId } : {}),
    },
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
};

/**
 * Internal implementation for public API observations queries.
 * Consolidates count and list queries into a single implementation.
 */
const getObservationsFromEventsTableForPublicApiInternal = async <T>(
  opts: PublicApiObservationsQuery & { select: "rows" | "count" },
): Promise<Array<T>> => {
  const { projectId, page, limit, ...filterParams } = opts;

  // Convert public API filters to FilterList using column mapping
  const observationsFilter = convertApiProvidedFilterToClickhouseFilter(
    { ...filterParams, projectId, page, limit },
    PUBLIC_API_EVENTS_COLUMN_MAPPING,
  );

  // Add project filter
  observationsFilter.push(
    new StringFilter({
      clickhouseTable: "events",
      field: "project_id",
      operator: "=",
      value: projectId,
      tablePrefix: "e",
    }),
  );

  // Determine if we need to join traces (for userId filter)
  const hasTraceFilter = Boolean(filterParams.userId);

  // Extract time filter using helper
  const startTimeFrom = extractTimeFilter(observationsFilter);

  const appliedFilter = observationsFilter.apply();

  // Build SELECT clause based on query type
  const select =
    opts.select === "count"
      ? "count(*) as count"
      : `
    e.span_id as id,
    e.type as type,
    e.project_id as "project_id",
    e.name as name,
    e."model_parameters" as model_parameters,
    e.start_time as "start_time",
    e.end_time as "end_time",
    e.trace_id as "trace_id",
    e.completion_start_time as "completion_start_time",
    e.provided_usage_details as "provided_usage_details",
    e.usage_details as "usage_details",
    e.provided_cost_details as "provided_cost_details",
    e.cost_details as "cost_details",
    e.level as level,
    e.environment as "environment",
    e.status_message as "status_message",
    e.version as version,
    e.parent_span_id as "parent_observation_id",
    e.created_at as "created_at",
    e.updated_at as "updated_at",
    e.provided_model_name as "provided_model_name",
    e.total_cost as "total_cost",
    e.prompt_id as "prompt_id",
    e.prompt_name as "prompt_name",
    e.prompt_version as "prompt_version",
    e.model_id as "internal_model_id",
    if(isNull(end_time), NULL, date_diff('millisecond', start_time, end_time)) as latency,
    if(isNull(completion_start_time), NULL, date_diff('millisecond', start_time, completion_start_time)) as "time_to_first_token",
    e.input,
    e.output,
    e.metadata`;

  // Build CTEs - only include traces if needed
  const tracesCte = hasTraceFilter
    ? `traces AS (${eventsTracesAggregation({ projectId, startTimeFrom })})`
    : "";

  // Build query with conditional CTE
  const query = `
    ${tracesCte ? `WITH ${tracesCte}` : ""}
    SELECT ${select}
    FROM events e
    ${hasTraceFilter ? "LEFT JOIN traces t ON t.id = e.trace_id AND t.project_id = e.project_id" : ""}
    WHERE ${appliedFilter.query}
    ${opts.select === "rows" ? "ORDER BY toUnixTimestamp(e.start_time) DESC" : ""}
    ${opts.select === "rows" ? "LIMIT {limit: Int32} OFFSET {offset: Int32}" : ""}
  `;

  const result = await measureAndReturn({
    operationName: `getObservationsFromEventsTableForPublicApi_${opts.select}`,
    projectId,
    input: {
      params: {
        projectId,
        startTimeFrom,
        ...appliedFilter.params,
        ...(opts.select === "rows"
          ? { limit, offset: (page - 1) * limit }
          : {}),
      },
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
