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
} from "../../tableDefinitions";
import { OrderByState } from "../../interfaces/orderBy";
import { getTracesByIds } from "./traces";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import { convertObservation } from "./observations_converters";
import { clickhouseSearchCondition } from "../queries/clickhouse-sql/search";
import {
  OBSERVATIONS_TO_TRACE_INTERVAL,
  TRACE_TO_OBSERVATIONS_INTERVAL,
} from "./constants";
import { env } from "../../env";
import { TracingSearchType } from "../../interfaces/search";
import { ClickHouseClientConfigOptions } from "@clickhouse/client";
import { ObservationType } from "../../domain";
import { recordDistribution } from "../instrumentation";

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
};

export const getObservationsForTrace = async <IncludeIO extends boolean>(
  opts: GetObservationsForTraceOpts<IncludeIO>,
) => {
  const { traceId, projectId, timestamp, includeIO = false } = opts;

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
    completion_start_time,
    prompt_id,
    prompt_name,
    prompt_version,
    created_at,
    updated_at,
    event_ts
  FROM observations 
  WHERE trace_id = {traceId: String}
  AND project_id = {projectId: String}
   ${timestamp ? `AND start_time >= {traceTimestamp: DateTime64(3)} - ${TRACE_TO_OBSERVATIONS_INTERVAL}` : ""}
  ORDER BY event_ts DESC
  LIMIT 1 BY id, project_id`;
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

export const getObservationForTraceIdByName = async (
  traceId: string,
  projectId: string,
  name: string,
  timestamp?: Date,
  fetchWithInputOutput: boolean = false,
) => {
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
    completion_start_time,
    prompt_id,
    prompt_name,
    prompt_version,
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

  return records.map(convertObservation);
};

export const getObservationById = async ({
  id,
  projectId,
  fetchWithInputOutput = false,
  startTime,
  type,
  traceId,
}: {
  id: string;
  projectId: string;
  fetchWithInputOutput?: boolean;
  startTime?: Date;
  type?: ObservationType;
  traceId?: string;
}) => {
  const records = await getObservationByIdInternal({
    id,
    projectId,
    fetchWithInputOutput,
    startTime,
    type,
    traceId,
  });
  const mapped = records.map(convertObservation);

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
    completion_start_time,
    prompt_id,
    prompt_name,
    prompt_version,
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
  return records.map(convertObservation);
};

const getObservationByIdInternal = async ({
  id,
  projectId,
  fetchWithInputOutput = false,
  startTime,
  type,
  traceId,
}: {
  id: string;
  projectId: string;
  fetchWithInputOutput?: boolean;
  startTime?: Date;
  type?: ObservationType;
  traceId?: string;
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
    ${fetchWithInputOutput ? "input, output," : ""}
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
  clickhouseConfigs?: ClickHouseClientConfigOptions | undefined;
};

export type ObservationsTableQueryResult = ObservationRecordReadType & {
  latency?: string;
  time_to_first_token?: string;
  trace_tags?: string[];
  trace_name?: string;
  trace_user_id?: string;
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
        o.prompt_id as "prompt_id",
        o.prompt_name as "prompt_name",
        o.prompt_version as "prompt_version",
        internal_model_id as "internal_model_id",
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
    ? `
    ${select},
    ${selectIOAndMetadata ? `o.input, o.output, o.metadata` : ""}
  `
    : select;

  const scoresFilter = new FilterList([
    new StringFilter({
      clickhouseTable: "scores",
      field: "project_id",
      operator: "=",
      value: projectId,
    }),
  ]);

  const timeFilter = opts.filter.find(
    (f) =>
      f.column === "Start Time" && (f.operator === ">=" || f.operator === ">"),
  );

  // query optimisation: joining traces onto observations is expensive. Hence, only join if the UI table contains filters on traces.
  const traceTableFilter = opts.filter.filter(
    (f) =>
      observationsTableTraceUiColumnDefinitions
        .map((c) => c.uiTableId)
        .includes(f.column) ||
      observationsTableTraceUiColumnDefinitions
        .map((c) => c.uiTableName)
        .includes(f.column),
  );

  const hasScoresFilter = filter.some((f) =>
    f.column.toLowerCase().includes("scores"),
  );

  const orderByTraces = opts.orderBy
    ? observationsTableTraceUiColumnDefinitions
        .map((c) => c.uiTableId)
        .includes(opts.orderBy.column) ||
      observationsTableTraceUiColumnDefinitions
        .map((c) => c.uiTableName)
        .includes(opts.orderBy.column)
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
        scores final
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
        ${traceTableFilter.length > 0 || orderByTraces || search.query ? "LEFT JOIN traces t FINAL ON t.id = o.trace_id AND t.project_id = o.project_id" : ""}
        ${hasScoresFilter ? `LEFT JOIN scores_agg AS s ON s.trace_id = o.trace_id and s.observation_id = o.id` : ""}
      WHERE ${appliedObservationsFilter.query}
        
        ${timeFilter && (traceTableFilter.length > 0 || orderByTraces) ? `AND t.timestamp > {tracesTimestampFilter: DateTime64(3)} - ${OBSERVATIONS_TO_TRACE_INTERVAL}` : ""}
        ${search.query}
      ${chOrderBy}
      ${opts.select === "rows" ? "LIMIT 1 BY o.id, o.project_id" : ""}
      ${limit !== undefined && offset !== undefined ? `LIMIT ${limit} OFFSET ${offset}` : ""};`;

  const res = await queryClickhouse<T>({
    query,
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
    },
    clickhouseConfigs,
  });

  return res;
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
    AND o.type = 'GENERATION'
    GROUP BY o.name
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
  const query = `
    DELETE FROM observations
    WHERE project_id = {projectId: String}
    AND trace_id IN ({traceIds: Array(String)});
  `;
  await commandClickhouse({
    query: query,
    params: {
      projectId,
      traceIds,
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

export const deleteObservationsByProjectId = async (projectId: string) => {
  const query = `
    DELETE FROM observations
    WHERE project_id = {projectId: String};
  `;
  await commandClickhouse({
    query: query,
    params: {
      projectId,
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

export const deleteObservationsOlderThanDays = async (
  projectId: string,
  beforeDate: Date,
) => {
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
};

export const getObservationsWithPromptName = async (
  projectId: string,
  promptNames: string[],
) => {
  const query = `
  SELECT count(*) as count, prompt_name
  FROM observations FINAL
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
  });

  return records;
};

export const getGenerationsForPostHog = async function* (
  projectId: string,
  minTimestamp: Date,
  maxTimestamp: Date,
) {
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
      t.metadata['$posthog_session_id'] as posthog_session_id
    FROM observations o FINAL
    LEFT JOIN traces t FINAL ON o.trace_id = t.id AND o.project_id = t.project_id
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
      request_timeout: 300_000, // 5 minutes
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
      langfuse_url: `${baseUrl}/project/${projectId}/traces/${encodeURIComponent(record.trace_id as string)}?observation=${encodeURIComponent(record.id as string)}`,
      langfuse_id: record.id,
      langfuse_cost_usd: record.total_cost,
      langfuse_input_units: record.input_tokens,
      langfuse_output_units: record.output_tokens,
      langfuse_total_units: record.total_tokens,
      langfuse_session_id: record.trace_session_id,
      langfuse_project_id: projectId,
      langfuse_user_id: record.trace_user_id || "langfuse_unknown_user",
      langfuse_latency: record.latency,
      langfuse_time_to_first_token: record.time_to_first_token,
      langfuse_release: record.trace_release,
      langfuse_version: record.version,
      langfuse_model: record.model,
      langfuse_level: record.level,
      langfuse_tags: record.trace_tags,
      langfuse_environment: record.environment,
      langfuse_event_version: "1.0.0",
      $session_id: record.posthog_session_id ?? null,
      $set: {
        langfuse_user_url: record.user_id
          ? `${baseUrl}/project/${projectId}/users/${encodeURIComponent(record.user_id as string)}`
          : null,
      },
    };
  }
};
