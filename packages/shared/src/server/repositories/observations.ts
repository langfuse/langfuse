import {
  commandClickhouse,
  parseClickhouseUTCDateTimeFormat,
  queryClickhouse,
  queryClickhouseStream,
  upsertClickhouse,
} from "./clickhouse";
import { logger } from "../logger";
import { InternalServerError, LangfuseNotFoundError } from "../../errors";
import { prisma } from "../../db";
import { ObservationRecordReadType } from "./definitions";
import { FilterState } from "../../types";
import {
  DateTimeFilter,
  FilterList,
  StringFilter,
  FullObservations,
  orderByToClickhouseSql,
} from "../queries";
import { createFilterFromFilterState } from "../queries/clickhouse-sql/factory";
import {
  observationsTableTraceUiColumnDefinitions,
  observationsTableUiColumnDefinitions,
} from "../tableMappings";
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
import { clickhouseSearchCondition } from "../queries/clickhouse-sql/search";
import {
  OBSERVATIONS_TO_TRACE_INTERVAL,
  TRACE_TO_OBSERVATIONS_INTERVAL,
} from "./constants";
import { env } from "../../env";
import { TracingSearchType } from "../../interfaces/search";
import { ClickHouseClientConfigOptions } from "@clickhouse/client";
import type { AnalyticsGenerationEvent } from "../analytics-integrations/types";
import { ObservationType } from "../../domain";
import { recordDistribution } from "../instrumentation";
import { DEFAULT_RENDERING_PROPS, RenderingProps } from "../utils/rendering";
import { shouldSkipObservationsFinal } from "../queries/clickhouse-sql/query-options";

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
export const checkObservationExists = async (
  projectId: string,
  id: string,
  startTime: Date | undefined,
): Promise<boolean> => {
  const query = `
    SELECT id, project_id
    FROM observations o
    WHERE project_id = {projectId: String}
    AND id = {id: String}
    ${startTime ? `AND start_time >= {startTime: DateTime64(3)} - ${OBSERVATIONS_TO_TRACE_INTERVAL}` : ""}
    ORDER BY event_ts DESC
    LIMIT 1 BY id, project_id
  `;

  const rows = await queryClickhouse<{ id: string; project_id: string }>({
    query,
    params: {
      id,
      projectId,
      ...(startTime
        ? { startTime: convertDateToClickhouseDateTime(startTime) }
        : {}),
    },
    tags: {
      feature: "tracing",
      type: "observation",
      kind: "exists",
      projectId,
    },
  });

  return rows.length > 0;
};

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

export const getObservationsForTrace = async <IncludeIO extends boolean>(
  opts: GetObservationsForTraceOpts<IncludeIO>,
) => {
  const {
    traceId,
    projectId,
    timestamp,
    includeIO = false,
    preferredClickhouseService,
  } = opts;

  // OTel projects use immutable spans - no need for deduplication
  const skipDedup = await shouldSkipObservationsFinal(projectId);

  const query = `
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
    level,
    status_message,
    version,
    ${includeIO === true ? "input, output, metadata," : ""}
    provided_model_name,
    internal_model_id,
    model_parameters,
    provided_usage_details,
    usage_details,
    provided_cost_details,
    cost_details,
    total_cost,
    usage_pricing_tier_id,
    usage_pricing_tier_name,
    completion_start_time,
    prompt_id,
    prompt_name,
    prompt_version,
    tool_definitions,
    tool_calls,
    tool_call_names,
    created_at,
    updated_at,
    event_ts
  FROM observations
  WHERE trace_id = {traceId: String}
  AND project_id = {projectId: String}
   ${timestamp ? `AND start_time >= {traceTimestamp: DateTime64(3)} - ${TRACE_TO_OBSERVATIONS_INTERVAL}` : ""}
  ${skipDedup ? "" : "ORDER BY event_ts DESC"}
  ${skipDedup ? "" : "LIMIT 1 BY id, project_id"}`;
  const records = await queryClickhouse<ObservationRecordReadType>({
    query,
    params: {
      traceId,
      projectId,
      ...(timestamp
        ? { traceTimestamp: convertDateToClickhouseDateTime(timestamp) }
        : {}),
    },
    tags: {
      feature: "tracing",
      type: "observation",
      kind: "list",
      projectId,
    },
    preferredClickhouseService,
  });

  // Large number of observations in trace with large input / output / metadata will lead to
  // high CPU and memory consumption in the convertObservation step, where parsing occurs
  // Thus, limit the size of the payload to 5MB, follows NextJS response size limitation:
  // https://nextjs.org/docs/messages/api-routes-response-size-limit
  // See also LFE-4882 for more details
  let payloadSize = 0;

  for (const observation of records) {
    for (const key of ["input", "output"] as const) {
      const value = observation[key];

      if (value && typeof value === "string") {
        payloadSize += value.length;
      }
    }

    const metadataValues = Object.values(observation["metadata"] ?? {});

    metadataValues.forEach((value) => {
      if (value && typeof value === "string") {
        payloadSize += value.length;
      }
    });

    if (payloadSize >= env.LANGFUSE_API_TRACE_OBSERVATIONS_SIZE_LIMIT_BYTES) {
      const errorMessage = `Observations in trace are too large: ${(payloadSize / 1e6).toFixed(2)}MB exceeds limit of ${(env.LANGFUSE_API_TRACE_OBSERVATIONS_SIZE_LIMIT_BYTES / 1e6).toFixed(2)}MB`;

      throw new Error(errorMessage);
    }
  }

  return records.map((r) => {
    const observation = convertObservation({
      ...r,
      metadata: r.metadata ?? {},
    });
    recordDistribution(
      "langfuse.query_by_id_age",
      new Date().getTime() - observation.startTime.getTime(),
      {
        table: "observations",
      },
    );
    return observation;
  });
};

export const getObservationForTraceIdByName = async ({
  traceId,
  projectId,
  name,
  timestamp,
  fetchWithInputOutput = false,
}: {
  traceId: string;
  projectId: string;
  name: string;
  timestamp?: Date;
  fetchWithInputOutput?: boolean;
}) => {
  const query = `
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
    ${fetchWithInputOutput ? "input, output," : ""}
    provided_model_name,
    internal_model_id,
    model_parameters,
    provided_usage_details,
    usage_details,
    provided_cost_details,
    cost_details,
    total_cost,
    usage_pricing_tier_id,
    usage_pricing_tier_name,
    completion_start_time,
    prompt_id,
    prompt_name,
    prompt_version,
    tool_definitions,
    tool_calls,
    tool_call_names,
    created_at,
    updated_at,
    event_ts
  FROM observations
  WHERE trace_id = {traceId: String}
  AND project_id = {projectId: String}
  AND name = {name: String}
   ${timestamp ? `AND start_time >= {traceTimestamp: DateTime64(3)} - ${TRACE_TO_OBSERVATIONS_INTERVAL}` : ""}
  ORDER BY event_ts DESC
  LIMIT 1 BY id, project_id`;
  const records = await queryClickhouse<ObservationRecordReadType>({
    query,
    params: {
      traceId,
      projectId,
      name,
      ...(timestamp
        ? { traceTimestamp: convertDateToClickhouseDateTime(timestamp) }
        : {}),
    },
    tags: {
      feature: "tracing",
      type: "observation",
      kind: "list",
      projectId,
    },
  });

  return records.map((record) => convertObservation(record));
};

export const getObservationById = async ({
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
  const records = await getObservationByIdInternal({
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
        table: "observations",
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

export const getObservationsById = async (
  ids: string[],
  projectId: string,
  fetchWithInputOutput: boolean = false,
) => {
  const query = `
  SELECT
    id,
    trace_id,
    project_id,
    type,
    parent_observation_id,
    start_time,
    end_time,
    name,
    metadata,
    level,
    status_message,
    version,
    ${fetchWithInputOutput ? "input, output," : ""}
    provided_model_name,
    internal_model_id,
    model_parameters,
    provided_usage_details,
    usage_details,
    provided_cost_details,
    cost_details,
    total_cost,
    usage_pricing_tier_id,
    usage_pricing_tier_name,
    completion_start_time,
    prompt_id,
    prompt_name,
    prompt_version,
    tool_definitions,
    tool_calls,
    tool_call_names,
    created_at,
    updated_at,
    event_ts
  FROM observations
  WHERE id IN ({ids: Array(String)})
  AND project_id = {projectId: String}
  ORDER BY event_ts desc
  LIMIT 1 by id, project_id`;
  const records = await queryClickhouse<ObservationRecordReadType>({
    query,
    params: { ids, projectId },
  });
  return records.map((record) => convertObservation(record));
};

const getObservationByIdInternal = async ({
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
    id,
    trace_id,
    project_id,
    environment,
    type,
    parent_observation_id,
    start_time,
    end_time,
    name,
    metadata,
    level,
    status_message,
    version,
    ${fetchWithInputOutput ? (renderingProps.truncated ? `leftUTF8(input, ${env.LANGFUSE_SERVER_SIDE_IO_CHAR_LIMIT}) as input, leftUTF8(output, ${env.LANGFUSE_SERVER_SIDE_IO_CHAR_LIMIT}) as output,` : "input, output,") : ""}
    provided_model_name,
    internal_model_id,
    model_parameters,
    provided_usage_details,
    usage_details,
    provided_cost_details,
    cost_details,
    total_cost,
    usage_pricing_tier_id,
    usage_pricing_tier_name,
    completion_start_time,
    prompt_id,
    prompt_name,
    prompt_version,
    tool_definitions,
    tool_calls,
    tool_call_names,
    created_at,
    updated_at,
    event_ts
  FROM observations
  WHERE id = {id: String}
  AND project_id = {projectId: String}
  ${startTime ? `AND toDate(start_time) = toDate({startTime: DateTime64(3)})` : ""}
  ${type ? `AND type = {type: String}` : ""}
  ${traceId ? `AND trace_id = {traceId: String}` : ""}
  ORDER BY event_ts desc
  LIMIT 1 by id, project_id`;
  return await queryClickhouse<ObservationRecordReadType>({
    query,
    params: {
      id,
      projectId,
      ...(startTime
        ? { startTime: convertDateToClickhouseDateTime(startTime) }
        : {}),
      ...(traceId ? { traceId } : {}),
    },
    tags: {
      feature: "tracing",
      type: "observation",
      kind: "byId",
      projectId,
    },
    preferredClickhouseService,
  });
};

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
) => {
  const count = await getObservationsTableInternal<{
    count: string;
  }>({
    ...opts,
    select: "count",
    tags: { kind: "count" },
  });

  return Number(count[0].count);
};

export const getObservationsTableWithModelData = async (
  opts: ObservationTableQuery,
): Promise<FullObservations> => {
  const observationRecords = await getObservationsTableInternal<
    Omit<
      ObservationsTableQueryResult,
      "trace_tags" | "trace_name" | "trace_user_id"
    >
  >({
    ...opts,
    select: "rows",
    tags: { kind: "list" },
  });

  const uniqueModels: string[] = Array.from(
    new Set(
      observationRecords
        .map((r) => r.internal_model_id)
        .filter((r): r is string => Boolean(r)),
    ),
  );

  const [models, traces] = await Promise.all([
    uniqueModels.length > 0
      ? prisma.model.findMany({
          where: {
            id: {
              in: uniqueModels,
            },
            OR: [{ projectId: opts.projectId }, { projectId: null }],
          },
          include: {
            Price: true,
          },
        })
      : [],
    getTracesByIds(
      observationRecords
        .map((o) => o.trace_id)
        .filter((o): o is string => Boolean(o)),
      opts.projectId,
    ),
  ]);

  return observationRecords.map((o) => {
    const trace = traces.find((t) => t.id === o.trace_id);
    const model = models.find((m) => m.id === o.internal_model_id);
    return {
      ...convertObservation(o),
      latency: o.latency ? Number(o.latency) / 1000 : null,
      timeToFirstToken: o.time_to_first_token
        ? Number(o.time_to_first_token) / 1000
        : null,
      traceName: trace?.name ?? null,
      traceTags: trace?.tags ?? [],
      traceTimestamp: trace?.timestamp ?? null,
      userId: trace?.userId ?? null,
      // Tool counts for list view (actual data in toolDefinitions/toolCalls from domain)
      toolDefinitionsCount: o.tool_definitions_count
        ? Number(o.tool_definitions_count)
        : null,
      toolCallsCount: o.tool_calls_count ? Number(o.tool_calls_count) : null,
      ...enrichObservationWithModelData(model),
    };
  });
};

const getObservationsTableInternal = async <T>(
  opts: ObservationTableQuery & {
    select: "count" | "rows";
    tags: Record<string, string>;
  },
): Promise<Array<T>> => {
  const select =
    opts.select === "count"
      ? "count(*) as count"
      : `
        o.id as id,
        o.type as type,
        o.project_id as "project_id",
        o.name as name,
        o."model_parameters" as model_parameters,
        o.start_time as "start_time",
        o.end_time as "end_time",
        o.trace_id as "trace_id",
        o.completion_start_time as "completion_start_time",
        o.provided_usage_details as "provided_usage_details",
        o.usage_details as "usage_details",
        o.provided_cost_details as "provided_cost_details",
        o.cost_details as "cost_details",
        o.level as level,
        o.environment as "environment",
        o.status_message as "status_message",
        o.version as version,
        o.parent_observation_id as "parent_observation_id",
        o.created_at as "created_at",
        o.updated_at as "updated_at",
        o.provided_model_name as "provided_model_name",
        o.total_cost as "total_cost",
        o.usage_pricing_tier_id as "usage_pricing_tier_id",
        o.usage_pricing_tier_name as "usage_pricing_tier_name",
        o.prompt_id as "prompt_id",
        o.prompt_name as "prompt_name",
        o.prompt_version as "prompt_version",
        internal_model_id as "internal_model_id",
        if(isNull(end_time), NULL, date_diff('millisecond', start_time, end_time)) as latency,
        if(isNull(completion_start_time), NULL,  date_diff('millisecond', start_time, completion_start_time)) as "time_to_first_token",
        length(mapKeys(o.tool_definitions)) as "tool_definitions_count",
        length(o.tool_calls) as "tool_calls_count"`;

  const {
    projectId,
    filter,
    selectIOAndMetadata,
    limit,
    offset,
    orderBy,
    clickhouseConfigs,
  } = opts;

  // OTel projects use immutable spans - no need for deduplication
  const skipDedup = await shouldSkipObservationsFinal(projectId);

  const selectString = selectIOAndMetadata
    ? `${select}, o.input, o.output, o.metadata`
    : select;

  const timeFilter = filter.find(
    (f) =>
      f.column === "Start Time" && (f.operator === ">=" || f.operator === ">"),
  );

  const scoresFilter = new FilterList([
    new StringFilter({
      clickhouseTable: "scores",
      field: "project_id",
      operator: "=",
      value: projectId,
    }),
  ]);

  const hasScoresFilter = filter.some((f) =>
    f.column.toLowerCase().includes("score"),
  );

  // query optimisation: joining traces onto observations is expensive. Hence, only join if the UI table contains filters on traces.
  const traceTableFilter = filter.filter((f) =>
    observationsTableTraceUiColumnDefinitions.some(
      (c) => c.uiTableId === f.column || c.uiTableName === f.column,
    ),
  );

  const orderByTraces = orderBy
    ? observationsTableTraceUiColumnDefinitions.some(
        (c) =>
          c.uiTableId === orderBy.column || c.uiTableName === orderBy.column,
      )
    : undefined;

  timeFilter
    ? scoresFilter.push(
        new DateTimeFilter({
          clickhouseTable: "scores",
          field: "timestamp",
          operator: ">=",
          value: timeFilter.value as Date,
        }),
      )
    : undefined;

  const observationsFilter = new FilterList([
    new StringFilter({
      clickhouseTable: "observations",
      field: "project_id",
      operator: "=",
      value: projectId,
      tablePrefix: "o",
    }),
  ]);

  observationsFilter.push(
    ...createFilterFromFilterState(
      filter,
      observationsTableUiColumnDefinitions,
    ),
  );

  const appliedScoresFilter = scoresFilter.apply();
  const appliedObservationsFilter = observationsFilter.apply();

  const search = clickhouseSearchCondition(
    opts.searchQuery,
    opts.searchType,
    "o",
  );

  const scoresCte = `WITH scores_agg AS (
    SELECT
      trace_id,
      observation_id,
      -- For numeric scores, use tuples of (name, avg_value)
      groupArrayIf(
        tuple(name, avg_value),
        data_type IN ('NUMERIC', 'BOOLEAN')
      ) AS scores_avg,
      -- For categorical scores, use name:value format for improved query performance
      groupArrayIf(
        concat(name, ':', string_value),
        data_type = 'CATEGORICAL' AND notEmpty(string_value)
      ) AS score_categories
    FROM (
      SELECT
        trace_id,
        observation_id,
        name,
        avg(value) avg_value,
        string_value,
        data_type,
        comment
      FROM
        scores FINAL
      WHERE ${appliedScoresFilter.query}
      GROUP BY
        trace_id,
        observation_id,
        name,
        string_value,
        data_type,
        comment
      ORDER BY
        trace_id
      ) tmp
    GROUP BY
      trace_id,
      observation_id
  )`;

  // if we have default ordering by time, we order by toDate(o.start_time) first and then by
  // o.start_time. This way, clickhouse is able to read more efficiently directly from disk without ordering
  const newDefaultOrder =
    orderBy?.column === "startTime"
      ? [{ column: "order_by_date", order: orderBy.order }, orderBy]
      : [orderBy ?? null];

  const chOrderBy = orderByToClickhouseSql(newDefaultOrder, [
    ...observationsTableUiColumnDefinitions,
    {
      uiTableName: "order_by_date",
      uiTableId: "order_by_date",
      clickhouseTableName: "observation",
      clickhouseSelect: "toDate(o.start_time)",
    },
  ]);

  // joins with traces are very expensive. We need to filter by time as well.
  // We assume that a trace has to have been within the last 2 days to be relevant.

  const query = `
      ${scoresCte}
      SELECT
       ${selectString}
      FROM observations o
        ${traceTableFilter.length > 0 || orderByTraces || search.query ? "LEFT JOIN __TRACE_TABLE__ t FINAL ON t.id = o.trace_id AND t.project_id = o.project_id" : ""}
        ${hasScoresFilter ? `LEFT JOIN scores_agg AS s ON s.trace_id = o.trace_id and s.observation_id = o.id` : ""}
      WHERE ${appliedObservationsFilter.query}

        ${timeFilter && (traceTableFilter.length > 0 || orderByTraces) ? `AND t.timestamp > {tracesTimestampFilter: DateTime64(3)} - ${OBSERVATIONS_TO_TRACE_INTERVAL}` : ""}
        ${search.query}
      ${chOrderBy}
      ${opts.select === "rows" && !skipDedup ? "LIMIT 1 BY o.id, o.project_id" : ""}
      ${limit !== undefined && offset !== undefined ? `LIMIT ${limit} OFFSET ${offset}` : ""};`;

  return measureAndReturn({
    operationName: "getObservationsTableInternal",
    projectId,
    input: {
      params: {
        ...appliedScoresFilter.params,
        ...appliedObservationsFilter.params,
        ...(timeFilter
          ? {
              tracesTimestampFilter: convertDateToClickhouseDateTime(
                timeFilter.value as Date,
              ),
            }
          : {}),
        ...search.params,
      },
      tags: {
        ...(opts.tags ?? {}),
        feature: "tracing",
        type: "observation",
        projectId,
        kind: opts.select,
        operation_name: "getObservationsTableInternal",
      },
    },
    fn: async (input) => {
      return queryClickhouse<T>({
        query: query.replace("__TRACE_TABLE__", "traces"),
        params: input.params,
        tags: input.tags,
        clickhouseConfigs,
      });
    },
  });
};

export const getObservationsGroupedByModel = async (
  projectId: string,
  filter: FilterState,
) => {
  const observationsFilter = new FilterList([
    new StringFilter({
      clickhouseTable: "observations",
      field: "project_id",
      operator: "=",
      value: projectId,
      tablePrefix: "o",
    }),
  ]);

  observationsFilter.push(
    ...createFilterFromFilterState(
      filter,
      observationsTableUiColumnDefinitions,
    ),
  );

  const appliedObservationsFilter = observationsFilter.apply();

  // We mainly use queries like this to retrieve filter options.
  // Therefore, we can skip final as some inaccuracy in count is acceptable.
  const query = `
    SELECT o.provided_model_name as name
    FROM observations o
    WHERE ${appliedObservationsFilter.query}
    AND o.type = 'GENERATION'
    GROUP BY o.provided_model_name
    ORDER BY count() DESC
    LIMIT 1000;
  `;

  const res = await queryClickhouse<{ name: string }>({
    query,
    params: {
      ...appliedObservationsFilter.params,
    },
    tags: {
      feature: "tracing",
      type: "observation",
      kind: "analytic",
      projectId,
    },
  });
  return res.map((r) => ({ model: r.name }));
};

export const getObservationsGroupedByModelId = async (
  projectId: string,
  filter: FilterState,
) => {
  const observationsFilter = new FilterList([
    new StringFilter({
      clickhouseTable: "observations",
      field: "project_id",
      operator: "=",
      value: projectId,
      tablePrefix: "o",
    }),
  ]);

  observationsFilter.push(
    ...createFilterFromFilterState(
      filter,
      observationsTableUiColumnDefinitions,
    ),
  );

  const appliedObservationsFilter = observationsFilter.apply();

  // We mainly use queries like this to retrieve filter options.
  // Therefore, we can skip final as some inaccuracy in count is acceptable.
  const query = `
    SELECT o.internal_model_id as modelId
    FROM observations o
    WHERE ${appliedObservationsFilter.query}
    AND o.type = 'GENERATION'
    GROUP BY o.internal_model_id
    ORDER BY count() DESC
    LIMIT 1000;
  `;

  const res = await queryClickhouse<{ modelId: string }>({
    query,
    params: {
      ...appliedObservationsFilter.params,
    },
    tags: {
      feature: "tracing",
      type: "observation",
      kind: "analytic",
      projectId,
    },
  });
  return res.map((r) => ({ modelId: r.modelId }));
};

export const getObservationsGroupedByName = async (
  projectId: string,
  filter: FilterState,
  type: ObservationType | null = "GENERATION",
) => {
  const observationsFilter = new FilterList([
    new StringFilter({
      clickhouseTable: "observations",
      field: "project_id",
      operator: "=",
      value: projectId,
      tablePrefix: "o",
    }),
  ]);

  observationsFilter.push(
    ...createFilterFromFilterState(
      filter,
      observationsTableUiColumnDefinitions,
    ),
  );

  const appliedObservationsFilter = observationsFilter.apply();

  // We mainly use queries like this to retrieve filter options.
  // Therefore, we can skip final as some inaccuracy in count is acceptable.
  const query = `
    SELECT o.name as name
    FROM observations o
    WHERE ${appliedObservationsFilter.query}
    ${type ? `AND o.type = {type: String}` : ""}
    GROUP BY o.name
    ORDER BY count() DESC
    LIMIT 1000;
  `;

  const res = await queryClickhouse<{ name: string }>({
    query,
    params: {
      ...appliedObservationsFilter.params,
      ...(type ? { type } : {}),
    },
    tags: {
      feature: "tracing",
      type: "observation",
      kind: "analytic",
      projectId,
    },
  });
  return res;
};

export const getObservationsGroupedByToolName = async (
  projectId: string,
  filter: FilterState,
) => {
  const observationsFilter = new FilterList([
    new StringFilter({
      clickhouseTable: "observations",
      field: "project_id",
      operator: "=",
      value: projectId,
      tablePrefix: "o",
    }),
  ]);

  observationsFilter.push(
    ...createFilterFromFilterState(
      filter,
      observationsTableUiColumnDefinitions,
    ),
  );

  const appliedObservationsFilter = observationsFilter.apply();

  const query = `
    SELECT arrayJoin(mapKeys(o.tool_definitions)) as toolName
    FROM observations o
    WHERE ${appliedObservationsFilter.query}
    AND length(mapKeys(o.tool_definitions)) > 0
    GROUP BY toolName
    ORDER BY count() DESC
    LIMIT 1000;
  `;

  const res = await queryClickhouse<{ toolName: string }>({
    query,
    params: {
      ...appliedObservationsFilter.params,
    },
    tags: {
      feature: "tracing",
      type: "observation",
      kind: "analytic",
      projectId,
    },
  });
  return res;
};

export const getObservationsGroupedByCalledToolName = async (
  projectId: string,
  filter: FilterState,
) => {
  const observationsFilter = new FilterList([
    new StringFilter({
      clickhouseTable: "observations",
      field: "project_id",
      operator: "=",
      value: projectId,
      tablePrefix: "o",
    }),
  ]);

  observationsFilter.push(
    ...createFilterFromFilterState(
      filter,
      observationsTableUiColumnDefinitions,
    ),
  );

  const appliedObservationsFilter = observationsFilter.apply();

  const query = `
    SELECT arrayJoin(o.tool_call_names) as calledToolName
    FROM observations o
    WHERE ${appliedObservationsFilter.query}
    AND length(o.tool_call_names) > 0
    GROUP BY calledToolName
    ORDER BY count() DESC
    LIMIT 1000;
  `;

  const res = await queryClickhouse<{ calledToolName: string }>({
    query,
    params: {
      ...appliedObservationsFilter.params,
    },
    tags: {
      feature: "tracing",
      type: "observation",
      kind: "analytic",
      projectId,
    },
  });
  return res;
};

export const getObservationsGroupedByPromptName = async (
  projectId: string,
  filter: FilterState,
) => {
  const observationsFilter = new FilterList([
    new StringFilter({
      clickhouseTable: "observations",
      field: "project_id",
      operator: "=",
      value: projectId,
      tablePrefix: "o",
    }),
  ]);

  observationsFilter.push(
    ...createFilterFromFilterState(
      filter,
      observationsTableUiColumnDefinitions,
    ),
  );

  const appliedObservationsFilter = observationsFilter.apply();

  // We mainly use queries like this to retrieve filter options.
  // Therefore, we can skip final as some inaccuracy in count is acceptable.
  const query = `
    SELECT o.prompt_id as id
    FROM observations o
    WHERE ${appliedObservationsFilter.query}
    AND o.type = 'GENERATION'
    AND o.prompt_id IS NOT NULL
    GROUP BY o.prompt_id
    ORDER BY count() DESC
    LIMIT 1000;
    `;

  const res = await queryClickhouse<{ id: string }>({
    query,
    params: {
      ...appliedObservationsFilter.params,
    },
    tags: {
      feature: "tracing",
      type: "observation",
      kind: "analytic",
      projectId,
    },
  });

  const prompts = res.map((r) => r.id).filter((r): r is string => Boolean(r));

  const pgPrompts =
    prompts.length > 0
      ? await prisma.prompt.findMany({
          select: {
            id: true,
            name: true,
          },
          where: {
            id: {
              in: prompts,
            },
            projectId,
          },
        })
      : [];

  return pgPrompts.map((p) => ({
    promptName: p.name,
  }));
};

export const getCostForTraces = async (
  projectId: string,
  timestamp: Date,
  traceIds: string[],
) => {
  // Wrapping the query in a CTE allows us to skip FINAL which allows Clickhouse to use skip indexes.
  const query = `
    WITH selected_observations AS (
      SELECT o.total_cost as total_cost
      FROM observations o
      WHERE o.project_id = {projectId: String}
      AND o.trace_id IN ({traceIds: Array(String)})
      AND o.start_time >= {timestamp: DateTime64(3)} - ${OBSERVATIONS_TO_TRACE_INTERVAL}
      ORDER BY o.event_ts DESC
      LIMIT 1 BY o.id, o.project_id
    )

    SELECT sum(total_cost) as total_cost
    FROM selected_observations
 `;

  const res = await queryClickhouse<{ total_cost: string }>({
    query,
    params: {
      projectId,
      traceIds,
      timestamp: convertDateToClickhouseDateTime(timestamp),
    },
    tags: {
      feature: "tracing",
      type: "observation",
      kind: "analytic",
      projectId,
    },
  });
  return res.length > 0 ? Number(res[0].total_cost) : undefined;
};

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

export const hasAnyObservation = async (projectId: string) => {
  const query = `
    SELECT 1
    FROM observations
    WHERE project_id = {projectId: String}
    LIMIT 1
  `;

  const rows = await queryClickhouse<{ 1: number }>({
    query,
    params: { projectId },
    tags: {
      feature: "tracing",
      type: "observation",
      kind: "hasAny",
      projectId,
    },
  });

  return rows.length > 0;
};

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
) => {
  const query = `
    SELECT 1
    FROM observations
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
      type: "observation",
      kind: "hasAnyOlderThan",
      projectId,
    },
  });

  return rows.length > 0;
};

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

export const getObservationsWithPromptName = async (
  projectId: string,
  promptNames: string[],
) => {
  const query = `
  SELECT uniq(id) as count, prompt_name
  FROM observations
  WHERE project_id = {projectId: String}
  AND prompt_name IN ({promptNames: Array(String)})
  AND prompt_name IS NOT NULL
  GROUP BY prompt_name
`;
  const rows = await queryClickhouse<{ count: string; prompt_name: string }>({
    query: query,
    params: {
      projectId,
      promptNames,
    },
    tags: {
      feature: "tracing",
      type: "observation",
      kind: "list",
      projectId,
    },
  });

  return rows.map((r) => ({
    count: Number(r.count),
    promptName: r.prompt_name,
  }));
};

export const getObservationMetricsForPrompts = async (
  projectId: string,
  promptIds: string[],
) => {
  const query = `
      WITH latencies AS
          (
              SELECT
                  prompt_id,
                  prompt_version,
                  start_time,
                  end_time,
                  usage_details,
                  cost_details,
                  dateDiff('millisecond', start_time, end_time) AS latency_ms
              FROM observations
              FINAL
              WHERE (type = 'GENERATION')
              AND (prompt_name IS NOT NULL)
              AND project_id={projectId: String}
              AND prompt_id IN ({promptIds: Array(String)})
          )
      SELECT
          count(*) AS count,
          prompt_id,
          prompt_version,
          min(start_time) AS first_observation,
          max(start_time) AS last_observation,
          medianExact(arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'input') > 0, usage_details)))) AS median_input_usage,
          medianExact(arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, usage_details)))) AS median_output_usage,
          medianExact(cost_details['total']) AS median_total_cost,
          medianExact(latency_ms) AS median_latency_ms
      FROM latencies
      GROUP BY
          prompt_id,
          prompt_version
      ORDER BY prompt_version DESC
`;
  const rows = await queryClickhouse<{
    count: string;
    prompt_id: string;
    prompt_version: number;
    first_observation: string;
    last_observation: string;
    median_input_usage: string;
    median_output_usage: string;
    median_total_cost: string;
    median_latency_ms: string;
  }>({
    query: query,
    params: {
      projectId,
      promptIds,
    },
    tags: {
      feature: "tracing",
      type: "observation",
      kind: "analytic",
      projectId,
    },
  });

  return rows.map((r) => ({
    count: Number(r.count),
    promptId: r.prompt_id,
    promptVersion: r.prompt_version,
    firstObservation: parseClickhouseUTCDateTimeFormat(r.first_observation),
    lastObservation: parseClickhouseUTCDateTimeFormat(r.last_observation),
    medianInputUsage: Number(r.median_input_usage),
    medianOutputUsage: Number(r.median_output_usage),
    medianTotalCost: Number(r.median_total_cost),
    medianLatencyMs: Number(r.median_latency_ms),
  }));
};

export const getLatencyAndTotalCostForObservations = async (
  projectId: string,
  observationIds: string[],
  timestamp?: Date,
) => {
  const query = `
    SELECT
        id,
        cost_details['total'] AS total_cost,
        dateDiff('millisecond', start_time, end_time) AS latency_ms
    FROM observations FINAL
    WHERE project_id = {projectId: String}
    AND id IN ({observationIds: Array(String)})
    ${timestamp ? `AND start_time >= {timestamp: DateTime64(3)}` : ""}
`;
  const rows = await queryClickhouse<{
    id: string;
    total_cost: string;
    latency_ms: string;
  }>({
    query: query,
    params: {
      projectId,
      observationIds,
      ...(timestamp
        ? { timestamp: convertDateToClickhouseDateTime(timestamp) }
        : {}),
    },
    tags: {
      feature: "tracing",
      type: "observation",
      kind: "analytic",
      projectId,
    },
  });

  return rows.map((r) => ({
    id: r.id,
    totalCost: Number(r.total_cost),
    latency: Number(r.latency_ms) / 1000,
  }));
};

export const getLatencyAndTotalCostForObservationsByTraces = async (
  projectId: string,
  traceIds: string[],
  timestamp?: Date,
) => {
  const query = `
    SELECT
        trace_id,
        sumMap(cost_details)['total'] AS total_cost,
        dateDiff('millisecond', min(start_time), max(end_time)) AS latency_ms
    FROM observations FINAL
    WHERE project_id = {projectId: String}
    AND trace_id IN ({traceIds: Array(String)})
    ${timestamp ? `AND start_time >= {timestamp: DateTime64(3)}` : ""}
    GROUP BY trace_id
`;
  const rows = await queryClickhouse<{
    trace_id: string;
    total_cost: string;
    latency_ms: string;
  }>({
    query: query,
    params: {
      projectId,
      traceIds,
      ...(timestamp
        ? { timestamp: convertDateToClickhouseDateTime(timestamp) }
        : {}),
    },
    tags: {
      feature: "tracing",
      type: "observation",
      kind: "analytic",
      projectId,
    },
  });

  return rows.map((r) => ({
    traceId: r.trace_id,
    totalCost: Number(r.total_cost),
    latency: Number(r.latency_ms) / 1000,
  }));
};

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
export const getObservationsGroupedByTraceId = async (
  projectId: string,
  traceIds: string[],
  timestamp?: Date,
): Promise<Map<string, ObservationTuple[]>> => {
  if (traceIds.length === 0) return new Map();

  const query = `
    SELECT
        trace_id,
        groupArray((
          id,
          parent_observation_id,
          cost_details['total'],
          cost_details['input'],
          cost_details['output'],
          dateDiff('millisecond', start_time, end_time)
        )) AS observations
    FROM observations FINAL
    WHERE project_id = {projectId: String}
    AND trace_id IN ({traceIds: Array(String)})
    ${timestamp ? `AND start_time >= {timestamp: DateTime64(3)}` : ""}
    GROUP BY trace_id
  `;

  const groupedObservations = await queryClickhouse<{
    trace_id: string;
    observations: ObservationTuple[];
  }>({
    query,
    params: {
      projectId,
      traceIds,
      ...(timestamp
        ? { timestamp: convertDateToClickhouseDateTime(timestamp) }
        : {}),
    },
    tags: {
      feature: "tracing",
      type: "observation",
      kind: "analytic",
      projectId,
    },
  });

  return new Map(groupedObservations.map((g) => [g.trace_id, g.observations]));
};

export const getObservationCountsByProjectInCreationInterval = async ({
  start,
  end,
}: {
  start: Date;
  end: Date;
}) => {
  const query = `
    SELECT
      project_id,
      count(*) as count
    FROM observations
    WHERE created_at >= {start: DateTime64(3)}
    AND created_at < {end: DateTime64(3)}
    GROUP BY project_id
  `;

  const rows = await queryClickhouse<{ project_id: string; count: string }>({
    query,
    params: {
      start: convertDateToClickhouseDateTime(start),
      end: convertDateToClickhouseDateTime(end),
    },
    tags: {
      feature: "tracing",
      type: "observation",
      kind: "analytic",
    },
  });

  return rows.map((row) => ({
    projectId: row.project_id,
    count: Number(row.count),
  }));
};

export const getObservationCountOfProjectsSinceCreationDate = async ({
  projectIds,
  start,
}: {
  projectIds: string[];
  start: Date;
}) => {
  const query = `
    SELECT
      count(*) as count
    FROM observations
    WHERE project_id IN ({projectIds: Array(String)})
    AND created_at >= {start: DateTime64(3)}
  `;

  const rows = await queryClickhouse<{ count: string }>({
    query,
    params: {
      projectIds,
      start: convertDateToClickhouseDateTime(start),
    },
    tags: {
      feature: "tracing",
      type: "observation",
      kind: "analytic",
    },
  });

  return Number(rows[0]?.count ?? 0);
};

export const getTraceIdsForObservations = async (
  projectId: string,
  observationIds: string[],
) => {
  const query = `
    SELECT
      trace_id,
      id
    FROM observations
    WHERE project_id = {projectId: String}
    AND id IN ({observationIds: Array(String)})
  `;

  const rows = await queryClickhouse<{ id: string; trace_id: string }>({
    query,
    params: {
      projectId,
      observationIds,
    },
    tags: {
      feature: "tracing",
      type: "observation",
      kind: "list",
      projectId,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    traceId: row.trace_id,
  }));
};

export const getObservationsForBlobStorageExport = function (
  projectId: string,
  minTimestamp: Date,
  maxTimestamp: Date,
) {
  const query = `
    SELECT
      id,
      trace_id,
      project_id,
      environment,
      type,
      parent_observation_id,
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
      model_parameters,
      usage_details,
      cost_details,
      completion_start_time,
      prompt_name,
      prompt_version
    FROM observations FINAL
    WHERE project_id = {projectId: String}
    AND start_time >= {minTimestamp: DateTime64(3)}
    AND start_time <= {maxTimestamp: DateTime64(3)}
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
  });

  return records;
};

export const getGenerationsForAnalyticsIntegrations = async function* (
  projectId: string,
  projectName: string,
  minTimestamp: Date,
  maxTimestamp: Date,
) {
  const traceTable = "traces";

  const query = `
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
      t.metadata['$posthog_session_id'] as posthog_session_id,
      t.metadata['$mixpanel_session_id'] as mixpanel_session_id
    FROM observations o FINAL
    LEFT JOIN ${traceTable} t FINAL ON o.trace_id = t.id AND o.project_id = t.project_id
    WHERE o.project_id = {projectId: String}
    AND t.project_id = {projectId: String}
    AND o.start_time >= {minTimestamp: DateTime64(3)}
    AND o.start_time <= {maxTimestamp: DateTime64(3)}
    AND t.timestamp >= {minTimestamp: DateTime64(3)} - INTERVAL 7 DAY
    AND t.timestamp <= {maxTimestamp: DateTime64(3)}
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
      clickhouse_settings: {
        join_algorithm: "grace_hash",
        grace_hash_join_initial_buckets: "32",
      },
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
export const getObservationCountsByProjectAndDay = async ({
  startDate,
  endDate,
}: {
  startDate: Date;
  endDate: Date;
}) => {
  const query = `
    SELECT
      count(*) as count,
      project_id,
      toDate(start_time) as date
    FROM observations
    WHERE start_time >= {startDate: DateTime64(3)}
    AND start_time < {endDate: DateTime64(3)}
    GROUP BY project_id, toDate(start_time)
  `;

  const rows = await queryClickhouse<{
    count: string;
    project_id: string;
    date: string;
  }>({
    query,
    params: {
      startDate: convertDateToClickhouseDateTime(startDate),
      endDate: convertDateToClickhouseDateTime(endDate),
    },
    tags: {
      feature: "tracing",
      type: "observation",
      kind: "analytic",
    },
  });

  return rows.map((row) => ({
    count: Number(row.count),
    projectId: row.project_id,
    date: row.date,
  }));
};

/**
 * Get total cost grouped by evaluator ID (job_configuration_id) for the last week.
 *
 * @param projectId - Project ID
 * @param evaluatorIds - Array of evaluator IDs (job_configuration_id from metadata)
 * @returns Array of { evaluatorId, totalCost } objects
 */
export const getCostByEvaluatorIds = async (
  projectId: string,
  evaluatorIds: string[],
): Promise<Array<{ evaluatorId: string; totalCost: number }>> => {
  if (evaluatorIds.length === 0) return [];

  const query = `
    SELECT
      metadata['job_configuration_id'] as evaluator_id,
      sum(total_cost) as total_cost
    FROM observations FINAL
    WHERE project_id = {projectId: String}
      AND metadata['job_configuration_id'] IN ({evaluatorIds: Array(String)})
      AND type = 'GENERATION'
      AND start_time > today() - 7
    GROUP BY metadata['job_configuration_id']
  `;

  const rows = await queryClickhouse<{
    evaluator_id: string;
    total_cost: string;
  }>({
    query,
    params: {
      projectId,
      evaluatorIds,
    },
    tags: {
      feature: "evals",
      type: "observation",
      kind: "analytic",
      projectId,
    },
  });

  return rows.map((row) => ({
    evaluatorId: row.evaluator_id,
    totalCost: Number(row.total_cost),
  }));
};
