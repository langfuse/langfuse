/**
 * Logic mirrors repositories/observations.ts (ClickHouse); syntax adapted for OceanBase.
 */
import { DatabaseAdapterFactory } from "../database";
import { logger } from "../logger";
import { InternalServerError, LangfuseNotFoundError } from "../../errors";
import { prisma } from "../../db";
import { ObservationRecordReadType } from "../repositories/definitions";
import { FilterState } from "../../types";
import {
  DateTimeFilter,
  FilterList,
  StringFilter,
  FullObservations,
  orderByToClickhouseSql,
} from "../queries";
import { createFilterFromFilterState } from "../queries/oceanbase-sql/factory";
import {
  observationsTableTraceUiColumnDefinitions,
  observationsTableUiColumnDefinitions,
} from "../tableMappings";
import { OrderByState } from "../../interfaces/orderBy";
import { getTracesByIds } from "./traces";
import { measureAndReturn } from "../oceanbase/measureAndReturn";
import { convertDateToDateTime } from "../database";
import { convertObservation } from "../repositories/observations_converters";
import { oceanbaseSearchCondition } from "../queries/oceanbase-sql/search";
import {
  OBSERVATIONS_TO_TRACE_INTERVAL,
  TRACE_TO_OBSERVATIONS_INTERVAL,
} from "../repositories/constants";
import { env } from "../../env";
import { TracingSearchType } from "../../interfaces/search";
import { ObservationType } from "../../domain";
import type { AnalyticsGenerationEvent } from "../analytics-integrations/types";
import { recordDistribution } from "../instrumentation";
import { DEFAULT_RENDERING_PROPS, RenderingProps } from "../utils/rendering";
import { shouldSkipObservationsFinal } from "../queries/clickhouse-sql/query-options";
import { convertFilterParamsToPositional } from "../database/oceanbase-filter-helper";

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
  const adapter = DatabaseAdapterFactory.getInstance();
  const query = `
    SELECT ranked.id, ranked.project_id
    FROM (
      SELECT *,
        ROW_NUMBER() OVER (PARTITION BY id, project_id ORDER BY \`event_ts\` DESC) as rn
      FROM observations o
      WHERE project_id = ?
      AND id = ?
      ${startTime ? `AND start_time >= DATE_SUB(?, ${OBSERVATIONS_TO_TRACE_INTERVAL})` : ""}
    ) ranked
    WHERE rn = 1
  `;

  const params: unknown[] = [projectId, id];
  if (startTime) {
    params.push(convertDateToDateTime(startTime));
  }

  const rows = await adapter.queryWithOptions<{
    id: string;
    project_id: string;
  }>({
    query,
    params,
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
  const adapter = DatabaseAdapterFactory.getInstance();
  const observationWithDefaults = {
    ...observation,
    name: observation.name ?? "",
  } as ObservationRecordReadType;
  await adapter.upsert({
    table: "observations",
    records: [observationWithDefaults as ObservationRecordReadType],
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
  const adapter = DatabaseAdapterFactory.getInstance();
  const { traceId, projectId, timestamp, includeIO = false } = opts;

  // OTel projects use immutable spans - no need for deduplication (mirror CH)
  const skipDedup = await shouldSkipObservationsFinal(projectId);

  const fromClause = skipDedup
    ? `FROM observations
    WHERE trace_id = ?
    AND project_id = ?
    ${timestamp ? `AND start_time >= DATE_SUB(?, ${TRACE_TO_OBSERVATIONS_INTERVAL})` : ""}`
    : `FROM (
      SELECT *,
        ROW_NUMBER() OVER (PARTITION BY id, project_id ORDER BY \`event_ts\` DESC) as rn
      FROM observations
      WHERE trace_id = ?
      AND project_id = ?
      ${timestamp ? `AND start_time >= DATE_SUB(?, ${TRACE_TO_OBSERVATIONS_INTERVAL})` : ""}
    ) ranked
    WHERE rn = 1`;

  const query = `
    SELECT
      id,
      trace_id,
      project_id,
      \`type\`,
      parent_observation_id,
      environment,
      start_time,
      end_time,
      \`name\`,
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
      \`event_ts\`
    ${fromClause}
    ORDER BY \`event_ts\` DESC
  `;

  const params: unknown[] = [traceId, projectId];
  if (timestamp) {
    params.push(convertDateToDateTime(timestamp));
  }

  const records = await adapter.queryWithOptions<ObservationRecordReadType>({
    query,
    params,
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
  const adapter = DatabaseAdapterFactory.getInstance();
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
      \`event_ts\`
    FROM (
      SELECT *,
        ROW_NUMBER() OVER (PARTITION BY id, project_id ORDER BY \`event_ts\` DESC) as rn
      FROM observations 
      WHERE trace_id = ?
      AND project_id = ?
      AND \`name\` = ?
      ${timestamp ? `AND start_time >= DATE_SUB(?, ${TRACE_TO_OBSERVATIONS_INTERVAL})` : ""}
    ) ranked
    WHERE rn = 1
    ORDER BY \`event_ts\` DESC
  `;

  const params: unknown[] = [traceId, projectId, name];
  if (timestamp) {
    params.push(convertDateToDateTime(timestamp));
  }

  const records = await adapter.queryWithOptions<ObservationRecordReadType>({
    query,
    params,
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
}: {
  id: string;
  projectId: string;
  fetchWithInputOutput?: boolean;
  startTime?: Date;
  type?: ObservationType;
  traceId?: string;
  renderingProps?: RenderingProps;
}) => {
  const records = await getObservationByIdInternal({
    id,
    projectId,
    fetchWithInputOutput,
    startTime,
    type,
    traceId,
    renderingProps,
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
  const adapter = DatabaseAdapterFactory.getInstance();
  const query = `
  SELECT
    id,
    trace_id,
    project_id,
    \`type\`,
    parent_observation_id,
    start_time,
    end_time,
    \`name\`,
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
    \`event_ts\`
  FROM (
    SELECT *,
      ROW_NUMBER() OVER (PARTITION BY id, project_id ORDER BY \`event_ts\` DESC) as rn
    FROM observations
    WHERE id IN (${ids.map(() => "?").join(", ")})
    AND project_id = ?
  ) ranked
  WHERE rn = 1
  ORDER BY \`event_ts\` DESC
  `;

  const params: unknown[] = [...ids, projectId];

  const records = await adapter.queryWithOptions<ObservationRecordReadType>({
    query,
    params,
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
}: {
  id: string;
  projectId: string;
  fetchWithInputOutput?: boolean;
  startTime?: Date;
  type?: ObservationType;
  traceId?: string;
  renderingProps?: RenderingProps;
}) => {
  const adapter = DatabaseAdapterFactory.getInstance();
  const query = `
  SELECT
    id,
    trace_id,
    project_id,
    environment,
    \`type\`,
    parent_observation_id,
    start_time,
    end_time,
    \`name\`,
    metadata,
    level,
    status_message,
    version,
    ${fetchWithInputOutput ? (renderingProps.truncated ? `left(input, ${env.LANGFUSE_SERVER_SIDE_IO_CHAR_LIMIT}) as input, left(output, ${env.LANGFUSE_SERVER_SIDE_IO_CHAR_LIMIT}) as output,` : "input, output,") : ""}
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
    \`event_ts\`
  FROM (
    SELECT *,
      ROW_NUMBER() OVER (PARTITION BY id, project_id ORDER BY \`event_ts\` DESC) as rn
    FROM observations
    WHERE id = ?
    AND project_id = ?
    ${startTime ? `AND DATE(start_time) = DATE(?)` : ""}
    ${type ? "AND `type` = ?" : ""}
    ${traceId ? `AND trace_id = ?` : ""}
  ) ranked
  WHERE rn = 1
  ORDER BY \`event_ts\` DESC
  `;

  const params: unknown[] = [id, projectId];
  if (startTime) {
    params.push(convertDateToDateTime(startTime));
  }
  if (type) {
    params.push(type);
  }
  if (traceId) {
    params.push(traceId);
  }

  return await adapter.queryWithOptions<ObservationRecordReadType>({
    query,
    params,
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
    const converted = convertObservation(o);
    return {
      ...converted,
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
      toolDefinitionsCount: converted.toolDefinitions
        ? Object.keys(converted.toolDefinitions).length
        : null,
      toolCallsCount: converted.toolCalls?.length ?? null,
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
        id as id,
        \`type\` as type,
        project_id as "project_id",
        \`name\` as name,
        \`model_parameters\` as model_parameters,
        start_time as "start_time",
        end_time as "end_time",
        trace_id as "trace_id",
        completion_start_time as "completion_start_time",
        provided_usage_details as "provided_usage_details",
        usage_details as "usage_details",
        provided_cost_details as "provided_cost_details",
        cost_details as "cost_details",
        level as level,
        environment as "environment",
        status_message as "status_message",
        version as version,
        parent_observation_id as "parent_observation_id",
        created_at as "created_at",
        updated_at as "updated_at",
        provided_model_name as "provided_model_name",
        total_cost as "total_cost",
        prompt_id as "prompt_id",
        prompt_name as "prompt_name",
        prompt_version as "prompt_version",
        internal_model_id as "internal_model_id",
        CASE WHEN end_time IS NULL THEN NULL ELSE TIMESTAMPDIFF(MICROSECOND, start_time, end_time) / 1000 END as latency,
        CASE WHEN completion_start_time IS NULL THEN NULL ELSE TIMESTAMPDIFF(MICROSECOND, start_time, completion_start_time) / 1000 END as "time_to_first_token",
        DATE(start_time) as order_by_date`;

  const { projectId, filter, selectIOAndMetadata, limit, offset, orderBy } =
    opts;

  const selectString = selectIOAndMetadata
    ? `${select}, input, output, metadata`
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
    f.column.toLowerCase().includes("scores"),
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

  const search = oceanbaseSearchCondition(
    opts.searchQuery,
    opts.searchType,
    "o",
  );

  // Convert observations filter query and params for OceanBase
  let observationsFilterQuery = appliedObservationsFilter.query;
  let observationsFilterParams: unknown[] = [];
  if (appliedObservationsFilter.params) {
    const converted = convertFilterParamsToPositional(
      appliedObservationsFilter.query,
      appliedObservationsFilter.params,
    );
    observationsFilterQuery = converted.query;
    observationsFilterParams = converted.params;
    // Note: Table prefixes are already added by createFilterFromFilterState via column.queryPrefix
    // No need to add them again here
    observationsFilterQuery = observationsFilterQuery.replace(
      /"([^"]+)"/g,
      "`$1`",
    );
  }

  // Convert search query and params for OceanBase
  let searchQuery = search.query || "";
  let searchParams: unknown[] = [];
  if (search.params) {
    const converted = convertFilterParamsToPositional(
      search.query || "",
      search.params,
    );
    searchQuery = converted.query;
    searchParams = converted.params;
  }

  // Convert filter query and params for OceanBase
  let scoresFilterQuery = appliedScoresFilter.query;
  let scoresFilterParams: unknown[] = [];
  if (appliedScoresFilter.params) {
    const converted = convertFilterParamsToPositional(
      appliedScoresFilter.query,
      appliedScoresFilter.params,
    );
    scoresFilterQuery = converted.query;
    scoresFilterParams = converted.params;
  }

  const scoresCte = `WITH scores_agg AS (
    SELECT
      trace_id,
      observation_id,
      -- For numeric scores, use JSON array of objects
      JSON_ARRAYAGG(
        CASE 
          WHEN data_type IN ('NUMERIC', 'BOOLEAN') 
          THEN JSON_OBJECT('name', \`name\`, 'avg_value', avg_value)
          ELSE NULL
        END
      ) AS scores_avg,
      -- For categorical scores, use name:value format for improved query performance
      GROUP_CONCAT(
        CASE 
          WHEN data_type = 'CATEGORICAL' AND string_value IS NOT NULL AND string_value != ''
          THEN CONCAT(\`name\`, ':', string_value)
          ELSE NULL
        END
        SEPARATOR ','
      ) AS score_categories
    FROM (
      SELECT
        trace_id,
        observation_id,
        \`name\`,
        AVG(\`value\`) as avg_value,
        string_value,
        data_type,
        \`comment\`
      FROM
        scores
      WHERE ${scoresFilterQuery}
      GROUP BY
        trace_id,
        observation_id,
        \`name\`,
        string_value,
        data_type,
        \`comment\`
      ORDER BY
        trace_id
      ) tmp
    GROUP BY
      trace_id, 
      observation_id
  )`;

  // if we have default ordering by time, we order by DATE(o.start_time) first and then by
  // o.start_time. This way, the database is able to read more efficiently directly from disk without ordering
  const newDefaultOrder =
    orderBy?.column === "startTime"
      ? [{ column: "order_by_date", order: orderBy.order }, orderBy]
      : [orderBy ?? null];

  // For OceanBase, use the column alias directly instead of the function expression
  // Remove all table aliases (o., t.) from clickhouseSelect since we're querying the outer query
  const orderByColumns = [
    ...observationsTableUiColumnDefinitions.map((col) => ({
      ...col,
      // Remove any table prefix (o., t., etc.) from clickhouseSelect
      clickhouseSelect: col.clickhouseSelect.replace(/^[ot]\./, ""),
      queryPrefix: undefined, // Remove query prefix for outer query
    })),
    {
      uiTableName: "order_by_date",
      uiTableId: "order_by_date",
      clickhouseTableName: "observation",
      clickhouseSelect: "order_by_date", // Use the alias directly
      queryPrefix: undefined,
    },
  ];

  let chOrderBy = orderByToClickhouseSql(newDefaultOrder, orderByColumns);

  // Convert double quotes to backticks for OceanBase/MySQL
  // Also remove any remaining table aliases that might have been added
  if (chOrderBy) {
    chOrderBy = chOrderBy.replace(/"([^"]+)"/g, "`$1`");
    // Remove any remaining table aliases (o., t.) from the ORDER BY clause
    chOrderBy = chOrderBy.replace(/[ot]\./g, "");
  }

  // joins with traces are very expensive. We need to filter by time as well.
  // We assume that a trace has to have been within the last 2 days to be relevant.
  const query = `
      ${scoresCte}
      SELECT
       ${selectString}
      FROM (
        SELECT 
          o.*,
          ROW_NUMBER() OVER (PARTITION BY o.id, o.project_id ORDER BY o.\`event_ts\` DESC) as rn
        FROM observations o 
        ${traceTableFilter.length > 0 || orderByTraces || searchQuery ? "LEFT JOIN __TRACE_TABLE__ t ON t.id = o.trace_id AND t.project_id = o.project_id" : ""}
        ${hasScoresFilter ? `LEFT JOIN scores_agg AS s ON s.trace_id = o.trace_id and s.observation_id = o.id` : ""}
        WHERE ${observationsFilterQuery}
          ${timeFilter && (traceTableFilter.length > 0 || orderByTraces) ? `AND t.timestamp > DATE_SUB(?, ${OBSERVATIONS_TO_TRACE_INTERVAL})` : ""}
          ${searchQuery}
      ) ranked
      WHERE ${opts.select === "rows" ? "rn = 1" : "1=1"}
      ${chOrderBy || ""}
      ${limit !== undefined && offset !== undefined ? `LIMIT ${limit} OFFSET ${offset}` : ""};`;

  return measureAndReturn({
    operationName: "getObservationsTableInternal",
    projectId,
    input: {
      params: [
        ...scoresFilterParams,
        ...observationsFilterParams,
        ...(timeFilter && (traceTableFilter.length > 0 || orderByTraces)
          ? [convertDateToDateTime(timeFilter.value as Date)]
          : []),
        ...searchParams,
      ],
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
      const adapter = DatabaseAdapterFactory.getInstance();
      return adapter.queryWithOptions<T>({
        query: query.replace("__TRACE_TABLE__", "traces"),
        params: input.params as unknown[],
        tags: { ...input.tags, experiment_amt: "original" },
      });
    },
  });
};

export const getObservationsGroupedByModel = async (
  projectId: string,
  filter: FilterState,
) => {
  const adapter = DatabaseAdapterFactory.getInstance();
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

  // Convert filter query and params for OceanBase
  let filterQuery = appliedObservationsFilter.query;
  let filterParams: unknown[] = [];
  if (appliedObservationsFilter.params) {
    const converted = convertFilterParamsToPositional(
      appliedObservationsFilter.query,
      appliedObservationsFilter.params,
    );
    filterQuery = converted.query;
    filterParams = converted.params;
  }

  // We mainly use queries like this to retrieve filter options.
  // Therefore, we can skip final as some inaccuracy in count is acceptable.
  const query = `
    SELECT o.provided_model_name as \`name\`
    FROM observations o
    WHERE ${filterQuery}
    AND o.type = 'GENERATION'
    GROUP BY o.provided_model_name
    ORDER BY count(*) DESC
    LIMIT 1000
  `;

  const res = await adapter.queryWithOptions<{ name: string }>({
    query,
    params: filterParams,
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
  const adapter = DatabaseAdapterFactory.getInstance();
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

  // Convert filter query and params for OceanBase
  let filterQuery = appliedObservationsFilter.query;
  let filterParams: unknown[] = [];
  if (appliedObservationsFilter.params) {
    const converted = convertFilterParamsToPositional(
      appliedObservationsFilter.query,
      appliedObservationsFilter.params,
    );
    filterQuery = converted.query;
    filterParams = converted.params;
  }

  // We mainly use queries like this to retrieve filter options.
  // Therefore, we can skip final as some inaccuracy in count is acceptable.
  const query = `
    SELECT o.internal_model_id as modelId
    FROM observations o
    WHERE ${filterQuery}
    AND o.type = 'GENERATION'
    GROUP BY o.internal_model_id
    ORDER BY count(*) DESC
    LIMIT 1000
  `;

  const res = await adapter.queryWithOptions<{ modelId: string }>({
    query,
    params: filterParams,
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
  const adapter = DatabaseAdapterFactory.getInstance();
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

  // Convert filter query and params for OceanBase
  let filterQuery = appliedObservationsFilter.query;
  let filterParams: unknown[] = [];
  if (appliedObservationsFilter.params) {
    const converted = convertFilterParamsToPositional(
      appliedObservationsFilter.query,
      appliedObservationsFilter.params,
    );
    filterQuery = converted.query;
    filterParams = converted.params;
  }

  // We mainly use queries like this to retrieve filter options.
  // Therefore, we can skip final as some inaccuracy in count is acceptable.
  const query = `
    SELECT o.\`name\` as name
    FROM observations o
    WHERE ${filterQuery}
    AND o.type = 'GENERATION'
    GROUP BY o.\`name\`
    ORDER BY count(*) DESC
    LIMIT 1000
  `;

  const res = await adapter.queryWithOptions<{ name: string }>({
    query,
    params: filterParams,
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
  const adapter = DatabaseAdapterFactory.getInstance();
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
  let filterQuery = appliedObservationsFilter.query;
  let filterParams: unknown[] = [];
  if (appliedObservationsFilter?.query && appliedObservationsFilter?.params) {
    const converted = convertFilterParamsToPositional(
      appliedObservationsFilter.query,
      appliedObservationsFilter.params,
    );
    filterQuery = converted.query;
    filterParams = converted.params;
  }

  // OceanBase: expand JSON object keys (mirror CH arrayJoin(mapKeys(o.tool_definitions)))
  const query = `
    SELECT JSON_UNQUOTE(JSON_EXTRACT(JSON_KEYS(o.tool_definitions), CONCAT('$[', n.n, ']'))) as toolName
    FROM observations o
    CROSS JOIN (
      SELECT 0 as n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
      UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9
    ) n
    WHERE ${filterQuery}
    AND JSON_LENGTH(JSON_KEYS(o.tool_definitions)) > 0
    AND JSON_EXTRACT(JSON_KEYS(o.tool_definitions), CONCAT('$[', n.n, ']')) IS NOT NULL
    GROUP BY toolName
    ORDER BY count(*) DESC
    LIMIT 1000
  `;

  const res = await adapter.queryWithOptions<{ toolName: string }>({
    query,
    params: filterParams,
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
  const adapter = DatabaseAdapterFactory.getInstance();
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
  let filterQuery = appliedObservationsFilter.query;
  let filterParams: unknown[] = [];
  if (appliedObservationsFilter?.query && appliedObservationsFilter?.params) {
    const converted = convertFilterParamsToPositional(
      appliedObservationsFilter.query,
      appliedObservationsFilter.params,
    );
    filterQuery = converted.query;
    filterParams = converted.params;
  }

  // OceanBase: expand JSON array (mirror CH arrayJoin(o.tool_call_names))
  const query = `
    SELECT JSON_UNQUOTE(JSON_EXTRACT(o.tool_call_names, CONCAT('$[', n.n, ']'))) as calledToolName
    FROM observations o
    CROSS JOIN (
      SELECT 0 as n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
      UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9
    ) n
    WHERE ${filterQuery}
    AND JSON_LENGTH(o.tool_call_names) > 0
    AND JSON_EXTRACT(o.tool_call_names, CONCAT('$[', n.n, ']')) IS NOT NULL
    GROUP BY calledToolName
    ORDER BY count(*) DESC
    LIMIT 1000
  `;

  const res = await adapter.queryWithOptions<{ calledToolName: string }>({
    query,
    params: filterParams,
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
  const adapter = DatabaseAdapterFactory.getInstance();
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

  // Convert filter query and params for OceanBase
  let filterQuery = appliedObservationsFilter.query;
  let filterParams: unknown[] = [];
  if (appliedObservationsFilter.params) {
    const converted = convertFilterParamsToPositional(
      appliedObservationsFilter.query,
      appliedObservationsFilter.params,
    );
    filterQuery = converted.query;
    filterParams = converted.params;
  }

  // We mainly use queries like this to retrieve filter options.
  // Therefore, we can skip final as some inaccuracy in count is acceptable.
  const query = `
    SELECT o.prompt_id as id
    FROM observations o
    WHERE ${filterQuery}
    AND o.type = 'GENERATION'
    AND o.prompt_id IS NOT NULL
    GROUP BY o.prompt_id
    ORDER BY count(*) DESC
    LIMIT 1000
  `;

  const res = await adapter.queryWithOptions<{ id: string }>({
    query,
    params: filterParams,
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
  const adapter = DatabaseAdapterFactory.getInstance();
  // Handle empty traceIds array by using 1=0 condition to avoid SQL syntax error with IN ()
  const traceIdCondition =
    traceIds.length === 0
      ? "AND 1=0"
      : `AND o.trace_id IN (${traceIds.map(() => "?").join(", ")})`;

  // Wrapping the query in a CTE allows us to use ROW_NUMBER() for deduplication instead of FINAL.
  const query = `
    WITH selected_observations AS (
      SELECT ranked.total_cost as total_cost
      FROM (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY o.id, o.project_id ORDER BY o.\`event_ts\` DESC) as rn
        FROM observations o
        WHERE o.project_id = ?
        ${traceIdCondition}
        AND o.start_time >= DATE_SUB(?, ${OBSERVATIONS_TO_TRACE_INTERVAL})
      ) ranked
      WHERE rn = 1
    )

    SELECT SUM(total_cost) as total_cost
    FROM selected_observations
  `;

  const params: unknown[] = [
    projectId,
    ...traceIds,
    convertDateToDateTime(timestamp),
  ];

  const res = await adapter.queryWithOptions<{ total_cost: string }>({
    query,
    params,
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
  const adapter = DatabaseAdapterFactory.getInstance();
  // Handle empty traceIds array by using 1=0 condition to avoid SQL syntax error with IN ()
  const traceIdCondition =
    traceIds.length === 0
      ? "AND 1=0"
      : `AND trace_id IN (${traceIds.map(() => "?").join(", ")})`;

  const query = `
    DELETE FROM observations
    WHERE project_id = ?
    ${traceIdCondition}
  `;
  await adapter.commandWithOptions({
    query: query,
    params: [projectId, ...traceIds],
    tags: {
      feature: "tracing",
      type: "observation",
      kind: "delete",
      projectId,
    },
  });
};

export const hasAnyObservation = async (projectId: string) => {
  const adapter = DatabaseAdapterFactory.getInstance();
  const query = `
    SELECT 1
    FROM observations
    WHERE project_id = ?
    LIMIT 1
  `;

  const rows = await adapter.queryWithOptions<{ 1: number }>({
    query,
    params: [projectId],
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

  const adapter = DatabaseAdapterFactory.getInstance();
  const query = `
    DELETE FROM observations
    WHERE project_id = ?
  `;
  await adapter.commandWithOptions({
    query,
    params: [projectId],
    tags: {
      feature: "tracing",
      type: "observation",
      kind: "delete",
      projectId,
    },
  });

  return true;
};

export const hasAnyObservationOlderThan = async (
  projectId: string,
  beforeDate: Date,
) => {
  const adapter = DatabaseAdapterFactory.getInstance();
  const query = `
    SELECT 1
    FROM observations
    WHERE project_id = ?
    AND start_time < ?
    LIMIT 1
  `;

  const rows = await adapter.queryWithOptions<{ 1: number }>({
    query,
    params: [projectId, adapter.convertDateToDateTime(beforeDate)],
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

  const adapter = DatabaseAdapterFactory.getInstance();
  const query = `
    DELETE FROM observations
    WHERE project_id = ?
    AND start_time < ?
  `;
  await adapter.commandWithOptions({
    query,
    params: [projectId, adapter.convertDateToDateTime(beforeDate)],
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
  const adapter = DatabaseAdapterFactory.getInstance();
  // Handle empty promptNames array by using 1=0 condition to avoid SQL syntax error with IN ()
  const promptNameCondition =
    promptNames.length === 0
      ? "AND 1=0"
      : `AND prompt_name IN (${promptNames.map(() => "?").join(", ")})`;

  const query = `
    SELECT COUNT(DISTINCT id) as count, prompt_name
    FROM observations
    WHERE project_id = ?
    ${promptNameCondition}
    AND prompt_name IS NOT NULL
    GROUP BY prompt_name
  `;

  const params: unknown[] = [projectId, ...promptNames];

  const rows = await adapter.queryWithOptions<{
    count: string;
    prompt_name: string;
  }>({
    query: query,
    params,
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
  const adapter = DatabaseAdapterFactory.getInstance();
  // Handle empty promptIds array by using 1=0 condition to avoid SQL syntax error with IN ()
  const promptIdCondition =
    promptIds.length === 0
      ? "AND 1=0"
      : `AND prompt_id IN (${promptIds.map(() => "?").join(", ")})`;

  // Note: MySQL/OceanBase doesn't have direct equivalents for medianExact and complex map functions
  // This is a simplified version that calculates approximate medians using subqueries
  const query = `
    WITH latencies AS (
      SELECT
        prompt_id,
        prompt_version,
        start_time,
        end_time,
        usage_details,
        cost_details,
        TIMESTAMPDIFF(MICROSECOND, start_time, end_time) / 1000 AS latency_ms,
        CAST(JSON_UNQUOTE(JSON_EXTRACT(usage_details, '$.input')) AS UNSIGNED) AS input_usage,
        CAST(JSON_UNQUOTE(JSON_EXTRACT(usage_details, '$.output')) AS UNSIGNED) AS output_usage,
        CAST(JSON_UNQUOTE(JSON_EXTRACT(cost_details, '$.total')) AS DECIMAL(10, 4)) AS total_cost
      FROM observations
      WHERE type = 'GENERATION'
      AND prompt_name IS NOT NULL
      AND project_id = ?
      ${promptIdCondition}
    ),
    ranked_latencies AS (
      SELECT
        *,
        ROW_NUMBER() OVER (PARTITION BY prompt_id, prompt_version ORDER BY input_usage) as rn_input,
        COUNT(*) OVER (PARTITION BY prompt_id, prompt_version) as cnt_input,
        ROW_NUMBER() OVER (PARTITION BY prompt_id, prompt_version ORDER BY output_usage) as rn_output,
        COUNT(*) OVER (PARTITION BY prompt_id, prompt_version) as cnt_output,
        ROW_NUMBER() OVER (PARTITION BY prompt_id, prompt_version ORDER BY total_cost) as rn_cost,
        COUNT(*) OVER (PARTITION BY prompt_id, prompt_version) as cnt_cost,
        ROW_NUMBER() OVER (PARTITION BY prompt_id, prompt_version ORDER BY latency_ms) as rn_latency,
        COUNT(*) OVER (PARTITION BY prompt_id, prompt_version) as cnt_latency
      FROM latencies
    )
    SELECT
      COUNT(*) AS count,
      prompt_id,
      prompt_version,
      MIN(start_time) AS first_observation,
      MAX(start_time) AS last_observation,
      -- Approximate median: take middle value when sorted
      CAST(AVG(CASE WHEN rn_input IN (FLOOR((cnt_input + 1) / 2), CEIL((cnt_input + 1) / 2)) THEN input_usage END) AS DECIMAL(10, 2)) AS median_input_usage,
      CAST(AVG(CASE WHEN rn_output IN (FLOOR((cnt_output + 1) / 2), CEIL((cnt_output + 1) / 2)) THEN output_usage END) AS DECIMAL(10, 2)) AS median_output_usage,
      CAST(AVG(CASE WHEN rn_cost IN (FLOOR((cnt_cost + 1) / 2), CEIL((cnt_cost + 1) / 2)) THEN total_cost END) AS DECIMAL(10, 4)) AS median_total_cost,
      CAST(AVG(CASE WHEN rn_latency IN (FLOOR((cnt_latency + 1) / 2), CEIL((cnt_latency + 1) / 2)) THEN latency_ms END) AS DECIMAL(10, 2)) AS median_latency_ms
    FROM ranked_latencies
    GROUP BY
      prompt_id,
      prompt_version
    ORDER BY prompt_version DESC
  `;

  const params: unknown[] = [projectId, ...promptIds];

  const rows = await adapter.queryWithOptions<{
    count: string;
    prompt_id: string;
    prompt_version: number;
    first_observation: string;
    last_observation: string;
    median_input_usage: string | null;
    median_output_usage: string | null;
    median_total_cost: string | null;
    median_latency_ms: string | null;
  }>({
    query: query,
    params,
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
    firstObservation: adapter.parseUTCDateTimeFormat(r.first_observation),
    lastObservation: adapter.parseUTCDateTimeFormat(r.last_observation),
    medianInputUsage: r.median_input_usage ? Number(r.median_input_usage) : 0,
    medianOutputUsage: r.median_output_usage
      ? Number(r.median_output_usage)
      : 0,
    medianTotalCost: r.median_total_cost ? Number(r.median_total_cost) : 0,
    medianLatencyMs: r.median_latency_ms ? Number(r.median_latency_ms) : 0,
  }));
};

export const getLatencyAndTotalCostForObservations = async (
  projectId: string,
  observationIds: string[],
  timestamp?: Date,
) => {
  const adapter = DatabaseAdapterFactory.getInstance();
  // Handle empty observationIds array by using 1=0 condition to avoid SQL syntax error with IN ()
  const observationIdCondition =
    observationIds.length === 0
      ? "AND 1=0"
      : `AND id IN (${observationIds.map(() => "?").join(", ")})`;

  const query = `
    SELECT
      id,
      CAST(JSON_UNQUOTE(JSON_EXTRACT(cost_details, '$.total')) AS DECIMAL(10, 4)) AS total_cost,
      TIMESTAMPDIFF(MICROSECOND, start_time, end_time) / 1000 AS latency_ms
    FROM observations
    WHERE project_id = ?
    ${observationIdCondition}
    ${timestamp ? `AND start_time >= ?` : ""}
  `;

  const params: unknown[] = [projectId, ...observationIds];
  if (timestamp) {
    params.push(convertDateToDateTime(timestamp));
  }

  const rows = await adapter.queryWithOptions<{
    id: string;
    total_cost: string | null;
    latency_ms: string | null;
  }>({
    query: query,
    params,
    tags: {
      feature: "tracing",
      type: "observation",
      kind: "analytic",
      projectId,
    },
  });

  return rows.map((r) => ({
    id: r.id,
    totalCost: r.total_cost ? Number(r.total_cost) : 0,
    latency: r.latency_ms ? Number(r.latency_ms) / 1000 : 0,
  }));
};

export const getLatencyAndTotalCostForObservationsByTraces = async (
  projectId: string,
  traceIds: string[],
  timestamp?: Date,
) => {
  const adapter = DatabaseAdapterFactory.getInstance();
  // Handle empty traceIds array by using 1=0 condition to avoid SQL syntax error with IN ()
  const traceIdCondition =
    traceIds.length === 0
      ? "AND 1=0"
      : `AND trace_id IN (${traceIds.map(() => "?").join(", ")})`;

  const query = `
    SELECT
      trace_id,
      SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(cost_details, '$.total')) AS DECIMAL(10, 4))) AS total_cost,
      TIMESTAMPDIFF(MICROSECOND, MIN(start_time), MAX(end_time)) / 1000 AS latency_ms
    FROM observations
    WHERE project_id = ?
    ${traceIdCondition}
    ${timestamp ? `AND start_time >= ?` : ""}
    GROUP BY trace_id
  `;

  const params: unknown[] = [projectId, ...traceIds];
  if (timestamp) {
    params.push(convertDateToDateTime(timestamp));
  }

  const rows = await adapter.queryWithOptions<{
    trace_id: string;
    total_cost: string | null;
    latency_ms: string | null;
  }>({
    query: query,
    params,
    tags: {
      feature: "tracing",
      type: "observation",
      kind: "analytic",
      projectId,
    },
  });

  return rows.map((r) => ({
    traceId: r.trace_id,
    totalCost: r.total_cost ? Number(r.total_cost) : 0,
    latency: r.latency_ms ? Number(r.latency_ms) / 1000 : 0,
  }));
};

/**
 * Tuple type for observation data (mirror CH groupArray tuple).
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
 * Get observations grouped by trace ID with cost and latency data (mirror CH).
 */
export const getObservationsGroupedByTraceId = async (
  projectId: string,
  traceIds: string[],
  timestamp?: Date,
): Promise<Map<string, ObservationTuple[]>> => {
  if (traceIds.length === 0) return new Map();

  const adapter = DatabaseAdapterFactory.getInstance();
  const query = `
    SELECT
      trace_id,
      id,
      parent_observation_id,
      COALESCE(JSON_UNQUOTE(JSON_EXTRACT(cost_details, '$.total')), '0') as total_cost,
      COALESCE(JSON_UNQUOTE(JSON_EXTRACT(cost_details, '$.input')), '0') as input_cost,
      COALESCE(JSON_UNQUOTE(JSON_EXTRACT(cost_details, '$.output')), '0') as output_cost,
      TIMESTAMPDIFF(MICROSECOND, start_time, end_time) / 1000 as latency_ms
    FROM (
      SELECT *,
        ROW_NUMBER() OVER (PARTITION BY id, project_id ORDER BY \`event_ts\` DESC) as rn
      FROM observations
      WHERE project_id = ?
      AND trace_id IN (${traceIds.map(() => "?").join(", ")})
      ${timestamp ? `AND start_time >= ?` : ""}
    ) ranked
    WHERE rn = 1
  `;

  const params: unknown[] = [projectId, ...traceIds];
  if (timestamp) {
    params.push(adapter.convertDateToDateTime(timestamp));
  }

  const rows = await adapter.queryWithOptions<{
    trace_id: string;
    id: string;
    parent_observation_id: string | null;
    total_cost: string;
    input_cost: string;
    output_cost: string;
    latency_ms: string | null;
  }>({
    query,
    params,
    tags: {
      feature: "tracing",
      type: "observation",
      kind: "analytic",
      projectId,
    },
  });

  const map = new Map<string, ObservationTuple[]>();
  for (const row of rows) {
    const tuple: ObservationTuple = [
      row.id,
      row.parent_observation_id,
      row.total_cost,
      row.input_cost,
      row.output_cost,
      row.latency_ms != null ? Number(row.latency_ms) : 0,
    ];
    const arr = map.get(row.trace_id) ?? [];
    arr.push(tuple);
    map.set(row.trace_id, arr);
  }
  return map;
};

export const getObservationCountsByProjectInCreationInterval = async ({
  start,
  end,
}: {
  start: Date;
  end: Date;
}) => {
  const adapter = DatabaseAdapterFactory.getInstance();
  const query = `
    SELECT 
      project_id,
      count(*) as count
    FROM observations
    WHERE created_at >= ?
    AND created_at < ?
    GROUP BY project_id
  `;

  const params: unknown[] = [
    convertDateToDateTime(start),
    convertDateToDateTime(end),
  ];

  const rows = await adapter.queryWithOptions<{
    project_id: string;
    count: string;
  }>({
    query,
    params,
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
  const adapter = DatabaseAdapterFactory.getInstance();
  const projectIdsPlaceholders =
    projectIds.length > 0 ? projectIds.map(() => "?").join(", ") : "NULL";
  const projectIdsCondition =
    projectIds.length > 0 ? `project_id IN (${projectIdsPlaceholders})` : "1=0";

  const query = `
    SELECT 
      count(*) as count
    FROM observations
    WHERE ${projectIdsCondition}
    AND created_at >= ?
  `;

  const params: unknown[] = [
    ...(projectIds.length > 0 ? projectIds : []),
    convertDateToDateTime(start),
  ];

  const rows = await adapter.queryWithOptions<{ count: string }>({
    query,
    params,
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
  const adapter = DatabaseAdapterFactory.getInstance();
  // Handle empty observationIds array by using 1=0 condition to avoid SQL syntax error with IN ()
  const observationIdCondition =
    observationIds.length === 0
      ? "AND 1=0"
      : `AND id IN (${observationIds.map(() => "?").join(", ")})`;

  const query = `
    SELECT 
      trace_id,
      id
    FROM observations
    WHERE project_id = ?
    ${observationIdCondition}
  `;

  const params: unknown[] = [projectId, ...observationIds];

  const rows = await adapter.queryWithOptions<{ id: string; trace_id: string }>(
    {
      query,
      params,
      tags: {
        feature: "tracing",
        type: "observation",
        kind: "list",
        projectId,
      },
    },
  );

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
  const adapter = DatabaseAdapterFactory.getInstance();
  const query = `
    SELECT
      id,
      trace_id,
      project_id,
      environment,
      \`type\`,
      parent_observation_id,
      start_time,
      end_time,
      \`name\`,
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
    FROM observations
    WHERE project_id = ?
    AND start_time >= ?
    AND start_time <= ?
  `;

  const params: unknown[] = [
    projectId,
    convertDateToDateTime(minTimestamp),
    convertDateToDateTime(maxTimestamp),
  ];

  const records = adapter.queryStreamWithOptions<Record<string, unknown>>({
    query,
    params,
    tags: {
      feature: "blobstorage",
      type: "observation",
      kind: "analytic",
      projectId,
    },
  });

  return records;
};

export const getGenerationsForAnalyticsIntegrations = async function* (
  projectId: string,
  minTimestamp: Date,
  maxTimestamp: Date,
) {
  const traceTable = "traces";
  const adapter = DatabaseAdapterFactory.getInstance();
  const minTs = adapter.convertDateToDateTime(minTimestamp);
  const maxTs = adapter.convertDateToDateTime(maxTimestamp);

  // Mirror CH: observations FINAL + traces FINAL, 7d trace window, type = GENERATION
  const query = `
    SELECT
      o.\`name\` as name,
      o.start_time as start_time,
      o.id as id,
      o.total_cost as total_cost,
      CASE WHEN o.completion_start_time IS NULL THEN NULL ELSE TIMESTAMPDIFF(MICROSECOND, o.start_time, o.completion_start_time) / 1000 END as time_to_first_token,
      CAST(JSON_UNQUOTE(JSON_EXTRACT(o.usage_details, '$.total')) AS UNSIGNED) as input_tokens,
      CAST(JSON_UNQUOTE(JSON_EXTRACT(o.usage_details, '$.output')) AS UNSIGNED) as output_tokens,
      CAST(JSON_UNQUOTE(JSON_EXTRACT(o.cost_details, '$.total')) AS UNSIGNED) as total_tokens,
      o.project_id as project_id,
      CASE WHEN o.end_time IS NULL THEN NULL ELSE TIMESTAMPDIFF(MICROSECOND, o.start_time, o.end_time) / 1000000 END as latency,
      o.provided_model_name as model,
      o.level as level,
      o.version as version,
      o.environment as environment,
      t.id as trace_id,
      t.\`name\` as trace_name,
      t.session_id as trace_session_id,
      t.user_id as trace_user_id,
      t.\`release\` as trace_release,
      t.tags as trace_tags,
      JSON_UNQUOTE(JSON_EXTRACT(t.metadata, '$.$posthog_session_id')) as posthog_session_id,
      JSON_UNQUOTE(JSON_EXTRACT(t.metadata, '$.$mixpanel_session_id')) as mixpanel_session_id
    FROM (
      SELECT *,
        ROW_NUMBER() OVER (PARTITION BY id, project_id ORDER BY \`event_ts\` DESC) as rn
      FROM observations
    ) o
    LEFT JOIN (
      SELECT *,
        ROW_NUMBER() OVER (PARTITION BY id, project_id ORDER BY \`event_ts\` DESC) as rn
      FROM ${traceTable}
    ) t ON o.trace_id = t.id AND o.project_id = t.project_id AND t.rn = 1
    WHERE o.rn = 1
    AND o.project_id = ?
    AND t.project_id = ?
    AND o.start_time >= ?
    AND o.start_time <= ?
    AND t.\`timestamp\` >= DATE_SUB(?, INTERVAL 7 DAY)
    AND t.\`timestamp\` <= ?
    AND o.\`type\` = 'GENERATION'
  `;

  const params: unknown[] = [projectId, projectId, minTs, maxTs, minTs, maxTs];

  const records = adapter.queryStreamWithOptions<Record<string, unknown>>({
    query,
    params,
    tags: {
      feature: "posthog",
      type: "observation",
      kind: "analytic",
      projectId,
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
 * Get observation counts grouped by project and day (mirror CH).
 * Uses half-open interval [startDate, endDate) for filtering based on start_time.
 */
export const getObservationCountsByProjectAndDay = async ({
  startDate,
  endDate,
}: {
  startDate: Date;
  endDate: Date;
}) => {
  const adapter = DatabaseAdapterFactory.getInstance();
  const query = `
    SELECT
      count(*) as count,
      project_id,
      DATE(start_time) as date
    FROM observations
    WHERE start_time >= ?
    AND start_time < ?
    GROUP BY project_id, DATE(start_time)
  `;

  const rows = await adapter.queryWithOptions<{
    count: string;
    project_id: string;
    date: string;
  }>({
    query,
    params: [
      adapter.convertDateToDateTime(startDate),
      adapter.convertDateToDateTime(endDate),
    ],
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
 * Get total cost grouped by evaluator ID (job_configuration_id) for the last week (mirror CH).
 */
export const getCostByEvaluatorIds = async (
  projectId: string,
  evaluatorIds: string[],
): Promise<Array<{ evaluatorId: string; totalCost: number }>> => {
  if (evaluatorIds.length === 0) return [];

  const adapter = DatabaseAdapterFactory.getInstance();
  const query = `
    SELECT
      JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.job_configuration_id')) as evaluator_id,
      SUM(total_cost) as total_cost
    FROM (
      SELECT *,
        ROW_NUMBER() OVER (PARTITION BY id, project_id ORDER BY \`event_ts\` DESC) as rn
      FROM observations
    ) ranked
    WHERE rn = 1
    AND project_id = ?
    AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.job_configuration_id')) IN (${evaluatorIds.map(() => "?").join(", ")})
    AND \`type\` = 'GENERATION'
    AND start_time > DATE_SUB(CURDATE(), INTERVAL 7 DAY)
    GROUP BY JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.job_configuration_id'))
  `;

  const rows = await adapter.queryWithOptions<{
    evaluator_id: string;
    total_cost: string;
  }>({
    query,
    params: [projectId, ...evaluatorIds],
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
