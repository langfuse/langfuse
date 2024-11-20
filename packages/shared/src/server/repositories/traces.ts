import {
  commandClickhouse,
  parseClickhouseUTCDateTimeFormat,
  queryClickhouse,
  upsertClickhouse,
} from "./clickhouse";
import {
  createFilterFromFilterState,
  getProjectIdDefaultFilter,
} from "../queries/clickhouse-sql/factory";
import { ObservationLevel, Trace } from "@prisma/client";
import { FilterState } from "../../types";
import { logger } from "../logger";
import {
  DateTimeFilter,
  FilterList,
  StringFilter,
  StringOptionsFilter,
} from "../queries/clickhouse-sql/clickhouse-filter";
import { TraceRecordReadType } from "./definitions";
import { tracesTableUiColumnDefinitions } from "../../tableDefinitions/mapTracesTable";
import { OrderByState } from "../../interfaces/orderBy";
import { orderByToClickhouseSql } from "../queries/clickhouse-sql/orderby-factory";
import { UiColumnMapping } from "../../tableDefinitions";
import { sessionCols } from "../../tableDefinitions/mapSessionTable";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import {
  convertClickhouseToDomain,
  convertToDomain,
} from "./traces_converters";
import { clickhouseSearchCondition } from "../queries/clickhouse-sql/search";
import { TRACE_TO_OBSERVATIONS_INTERVAL } from "./constants";

export type TracesTableReturnType = Pick<
  TraceRecordReadType,
  | "project_id"
  | "id"
  | "name"
  | "timestamp"
  | "bookmarked"
  | "release"
  | "version"
  | "user_id"
  | "session_id"
  | "tags"
  | "public"
> & {
  level: ObservationLevel;
  observation_count: number | null;
  latency_milliseconds: string | null;
  usage_details: Record<string, number>;
  cost_details: Record<string, number>;
  scores_avg: Array<{ name: string; avg_value: number }>;
};

export const getTracesTableCount = async (props: {
  projectId: string;
  filter: FilterState;
  searchQuery?: string;
  orderBy?: OrderByState;
  limit?: number;
  offset?: number;
}) => {
  const countRows = await getTracesTableGeneric<{ count: string }>({
    select: "count(*) as count",
    ...props,
  });

  const converted = countRows.map((row) => ({
    count: Number(row.count),
  }));

  return converted.length > 0 ? converted[0].count : 0;
};

export const getTracesTable = async (
  projectId: string,
  filter: FilterState,
  searchQuery?: string,
  orderBy?: OrderByState,
  limit?: number,
  page?: number,
) => {
  console.log("getTracesTable", limit, page);
  const rows = await getTracesTableGeneric<TracesTableReturnType>({
    select: `
    t.id, 
    t.project_id as project_id, 
    t.timestamp, 
    t.tags, 
    t.bookmarked, 
    t.name, 
    t.release, 
    t.version, 
    t.user_id, 
    t.session_id,
    os.latency_milliseconds,
    os.cost_details as cost_details,
    os.usage_details as usage_details,
    os.level as level,
    os.observation_count as observation_count,
    s.scores_avg as scores_avg,
    t.public`,
    projectId,
    filter,
    searchQuery,
    orderBy,
    limit,
    page,
  });

  return rows.map(convertToDomain);
};

type FetchTracesTableProps = {
  select: string;
  projectId: string;
  filter: FilterState;
  searchQuery?: string;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
};

const getTracesTableGeneric = async <T>(props: FetchTracesTableProps) => {
  const { select, projectId, filter, orderBy, limit, page, searchQuery } =
    props;

  const { tracesFilter, scoresFilter, observationsFilter } =
    getProjectIdDefaultFilter(projectId, { tracesPrefix: "t" });

  tracesFilter.push(
    ...createFilterFromFilterState(filter, tracesTableUiColumnDefinitions),
  );

  const traceIdFilter = tracesFilter.find(
    (f) => f.clickhouseTable === "traces" && f.field === "id",
  ) as StringFilter | StringOptionsFilter | undefined;

  traceIdFilter
    ? scoresFilter.push(
        new StringOptionsFilter({
          clickhouseTable: "scores",
          field: "trace_id",
          operator: "any of",
          values:
            traceIdFilter instanceof StringFilter
              ? [traceIdFilter.value]
              : traceIdFilter.values,
        }),
      )
    : null;
  traceIdFilter
    ? observationsFilter.push(
        new StringOptionsFilter({
          clickhouseTable: "observations",
          field: "trace_id",
          operator: "any of",
          values:
            traceIdFilter instanceof StringFilter
              ? [traceIdFilter.value]
              : traceIdFilter.values,
        }),
      )
    : null;

  // for query optimisation, we have to add the timeseries filter to observations + scores as well
  // stats show, that 98% of all observations have their start_time larger than trace.timestamp - 5 min
  const timeStampFilter = tracesFilter.find(
    (f) =>
      f.field === "timestamp" && (f.operator === ">=" || f.operator === ">"),
  ) as DateTimeFilter | undefined;

  timeStampFilter
    ? scoresFilter.push(
        new DateTimeFilter({
          clickhouseTable: "scores",
          field: "timestamp",
          operator: ">=",
          value: timeStampFilter.value,
        }),
      )
    : null;

  timeStampFilter
    ? observationsFilter.push(
        new DateTimeFilter({
          clickhouseTable: "observations",
          field: "start_time",
          operator: ">=",
          value: timeStampFilter.value,
        }),
      )
    : null;

  const tracesFilterRes = tracesFilter.apply();
  const scoresFilterRes = scoresFilter.apply();
  const observationFilterRes = observationsFilter.apply();

  const search = clickhouseSearchCondition(searchQuery);

  const query = `
    WITH observations_stats AS (
      SELECT
        COUNT(*) AS observation_count,
          sumMap(usage_details) as usage_details,
          SUM(total_cost) AS total_cost,
          date_diff('milliseconds', least(min(start_time), min(end_time)), greatest(max(start_time), max(end_time))) as latency_milliseconds,
          multiIf(
            arrayExists(x -> x = 'ERROR', groupArray(level)), 'ERROR',
            arrayExists(x -> x = 'WARNING', groupArray(level)), 'WARNING',
            arrayExists(x -> x = 'DEFAULT', groupArray(level)), 'DEFAULT',
            'DEBUG'
          ) AS level,
          sumMap(cost_details) as cost_details,
          trace_id,
          project_id
      FROM observations FINAL
      WHERE ${observationFilterRes.query}
      GROUP BY trace_id, project_id
    ),
    scores_avg AS (
      SELECT
        project_id,
        trace_id,
        groupArray(tuple(name, avg_value)) AS "scores_avg"
      FROM (
        SELECT project_id,
                trace_id,
                name,
                avg(value) avg_value
        FROM scores final
        WHERE ${scoresFilterRes.query}
        GROUP BY project_id,
                  trace_id,
                  name
      ) tmp
      GROUP BY project_id, trace_id
    )
    SELECT ${select}
    FROM traces t final
    LEFT JOIN observations_stats os on os.project_id = t.project_id and os.trace_id = t.id
    LEFT JOIN scores_avg s on s.project_id = t.project_id and s.trace_id = t.id
    WHERE ${tracesFilterRes.query}
    ${search.query}
    ${orderByToClickhouseSql(orderBy ?? null, tracesTableUiColumnDefinitions)}
    ${limit !== undefined && page !== undefined ? `LIMIT {limit: Int32} OFFSET {offset: Int32}` : ""}
  `;

  const res = await queryClickhouse<T>({
    query: query,
    params: {
      limit: limit,
      offset: (limit ?? 0) * (page ?? 0),
      ...tracesFilterRes.params,
      ...observationFilterRes.params,
      ...scoresFilterRes.params,
      ...search.params,
    },
  });

  return res;
};

/**
 * Accepts a trace in a Clickhouse-ready format.
 * id, project_id, and timestamp must always be provided.
 */
export const upsertTrace = async (trace: Partial<TraceRecordReadType>) => {
  if (!["id", "project_id", "timestamp"].every((key) => key in trace)) {
    throw new Error("Identifier fields must be provided to upsert Trace.");
  }
  await upsertClickhouse({
    table: "traces",
    records: [trace as TraceRecordReadType],
    eventBodyMapper: convertClickhouseToDomain,
  });
};

export const getTracesByIds = async (
  traceIds: string[],
  projectId: string,
  timestamp?: Date,
) => {
  const query = `
      SELECT * 
      FROM traces
      WHERE id IN ({traceIds: Array(String)})
      AND project_id = {projectId: String}
      ${timestamp ? `AND timestamp >= {timestamp: DateTime64(3)}` : ""} 
      ORDER BY event_ts DESC
      LIMIT 1 by id, project_id;`;
  const records = await queryClickhouse<TraceRecordReadType>({
    query,
    params: {
      traceIds,
      projectId,
      timestamp: timestamp ? convertDateToClickhouseDateTime(timestamp) : null,
    },
  });

  return records.map(convertClickhouseToDomain);
};

export const getTracesBySessionId = async (
  projectId: string,
  sessionIds: string[],
  timestamp?: Date,
) => {
  const query = `
      SELECT * 
      FROM traces
      WHERE session_id IN ({sessionIds: Array(String)})
      AND project_id = {projectId: String}
      ${timestamp ? `AND timestamp >= {timestamp: DateTime64(3)}` : ""} 
      ORDER BY event_ts DESC
      LIMIT 1 by id, project_id;`;
  const records = await queryClickhouse<TraceRecordReadType>({
    query,
    params: {
      sessionIds,
      projectId,
      timestamp: timestamp ? convertDateToClickhouseDateTime(timestamp) : null,
    },
  });

  return records.map(convertClickhouseToDomain);
};

export const hasAnyTrace = async (projectId: string) => {
  const query = `
    SELECT count(*) as count
    FROM traces
    WHERE project_id = {projectId: String}
    LIMIT 1
  `;

  const rows = await queryClickhouse<{ count: string }>({
    query,
    params: {
      projectId,
    },
  });

  return rows.length > 0 && Number(rows[0].count) > 0;
};

export const getTraceById = async (
  traceId: string,
  projectId: string,
  timestamp?: Date,
) => {
  const query = `
    SELECT * 
    FROM traces
    WHERE id = {traceId: String} 
    AND project_id = {projectId: String}
    ${timestamp ? `AND toDate(timestamp) = toDate({timestamp: DateTime64(3)})` : ""} 
    ORDER BY event_ts DESC 
    LIMIT 1
  `;

  const records = await queryClickhouse<TraceRecordReadType>({
    query,
    params: {
      traceId,
      projectId,
      ...(timestamp
        ? { timestamp: convertDateToClickhouseDateTime(timestamp) }
        : {}),
    },
  });

  const res = records.map(convertClickhouseToDomain);

  return res.shift();
};

export const getTracesGroupedByName = async (
  projectId: string,
  tableDefinitions: UiColumnMapping[] = tracesTableUiColumnDefinitions,
  timestampFilter?: FilterState,
) => {
  const chFilter = timestampFilter
    ? createFilterFromFilterState(timestampFilter, tableDefinitions)
    : undefined;

  const timestampFilterRes = chFilter
    ? new FilterList(chFilter).apply()
    : undefined;

  // We mainly use queries like this to retrieve filter options.
  // Therefore, we can skip final as some inaccuracy in count is acceptable.
  const query = `
      select 
        name as name,
        count(*) as count
      from traces t
      WHERE t.project_id = {projectId: String}
      AND t.name IS NOT NULL
      ${timestampFilterRes?.query ? `AND ${timestampFilterRes.query}` : ""}
      GROUP BY name
      ORDER BY count(*) desc
      LIMIT 1000;
    `;

  const rows = await queryClickhouse<{
    name: string;
    count: string;
  }>({
    query: query,
    params: {
      projectId: projectId,
      ...(timestampFilterRes ? timestampFilterRes.params : {}),
    },
  });

  return rows;
};

export const getTracesGroupedByUsers = async (
  projectId: string,
  filter: FilterState,
  searchQuery?: string,
  limit?: number,
  offset?: number,
  columns?: UiColumnMapping[],
) => {
  const { tracesFilter } = getProjectIdDefaultFilter(projectId, {
    tracesPrefix: "t",
  });

  tracesFilter.push(
    ...createFilterFromFilterState(
      filter,
      columns ?? tracesTableUiColumnDefinitions,
    ),
  );

  const tracesFilterRes = tracesFilter.apply();
  const search = clickhouseSearchCondition(searchQuery);

  // We mainly use queries like this to retrieve filter options.
  // Therefore, we can skip final as some inaccuracy in count is acceptable.
  const query = `
      select 
        user_id as user,
        count(*) as count
      from traces t
      WHERE t.project_id = {projectId: String}
      AND t.user_id IS NOT NULL
      AND t.user_id != ''
      ${tracesFilterRes?.query ? `AND ${tracesFilterRes.query}` : ""}
      ${search.query}
      GROUP BY user
      ORDER BY count desc
      ${limit !== undefined && offset !== undefined ? `LIMIT {limit: Int32} OFFSET {offset: Int32}` : ""}
  `;

  const rows = await queryClickhouse<{
    user: string;
    count: string;
  }>({
    query: query,
    params: {
      limit,
      offset,
      projectId,
      ...(tracesFilterRes ? tracesFilterRes.params : {}),
      ...(searchQuery ? search.params : {}),
    },
  });

  return rows;
};

export type GroupedTracesQueryProp = {
  projectId: string;
  filter: FilterState;
  columns?: UiColumnMapping[];
};

export const getTracesGroupedByTags = async (props: GroupedTracesQueryProp) => {
  const { projectId, filter, columns } = props;

  const chFilter = createFilterFromFilterState(
    filter,
    columns ?? tracesTableUiColumnDefinitions,
  );

  const filterRes = new FilterList(chFilter).apply();

  const query = `
    select distinct(arrayJoin(tags)) as value
    from traces t
    WHERE t.project_id = {projectId: String}
    ${filterRes?.query ? `AND ${filterRes.query}` : ""}
    LIMIT 1000;
  `;

  const rows = await queryClickhouse<{
    value: string;
  }>({
    query: query,
    params: {
      projectId: projectId,
      ...(filterRes ? filterRes.params : {}),
    },
  });

  return rows;
};

export type SessionDataReturnType = {
  session_id: string;
  max_timestamp: string;
  min_timestamp: string;
  trace_ids: string[];
  user_ids: string[];
  trace_count: number;
  trace_tags: string[];
  total_observations: number;
  duration: number;
  session_usage_details: Record<string, number>;
  session_cost_details: Record<string, number>;
  session_input_cost: string;
  session_output_cost: string;
  session_total_cost: string;
  session_input_usage: string;
  session_output_usage: string;
  session_total_usage: string;
};

export const getSessionsTableCount = async (props: {
  projectId: string;
  filter: FilterState;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
}) => {
  const rows = await getSessionsTableGeneric<{ count: string }>({
    select: `
      count(session_id) as count
    `,
    projectId: props.projectId,
    filter: props.filter,
    orderBy: props.orderBy,
    limit: props.limit,
    page: props.page,
  });

  return rows.length > 0 ? Number(rows[0].count) : 0;
};

export const getSessionsTable = async (props: {
  projectId: string;
  filter: FilterState;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
}) => {
  const rows = await getSessionsTableGeneric<SessionDataReturnType>({
    select: `
    session_id, 
    max_timestamp, 
    min_timestamp, 
    trace_ids, 
    user_ids, 
    trace_count, 
    trace_tags,
    total_observations,
    duration,
    session_usage_details,
    session_cost_details,
    session_input_cost,
    session_output_cost,
    session_total_cost,
    session_input_usage,
    session_output_usage,
    session_total_usage
    `,
    projectId: props.projectId,
    filter: props.filter,
    orderBy: props.orderBy,
    limit: props.limit,
    page: props.page,
  });

  return rows;
};

const getSessionsTableGeneric = async <T>(props: FetchTracesTableProps) => {
  const { select, projectId, filter, orderBy, limit, page } = props;

  const { tracesFilter, scoresFilter, observationsFilter } =
    getProjectIdDefaultFilter(projectId, { tracesPrefix: "s" });

  tracesFilter.push(...createFilterFromFilterState(filter, sessionCols));

  const tracesFilterRes = tracesFilter.apply();
  const scoresAvgFilterRes = scoresFilter.apply();
  const observationsStatsRes = observationsFilter.apply();

  const traceTimestampFilter: DateTimeFilter | undefined = tracesFilter.find(
    (f) =>
      f.field === "min_timestamp" &&
      (f.operator === ">=" || f.operator === ">"),
  ) as DateTimeFilter | undefined;

  const singleTraceFilter = traceTimestampFilter
    ? new FilterList([
        new DateTimeFilter({
          clickhouseTable: "traces",
          field: "timestamp",
          operator: traceTimestampFilter.operator,
          value: traceTimestampFilter.value,
        }),
      ]).apply()
    : undefined;

  const query = `
      WITH observations_agg AS (
        SELECT o.trace_id,
              count(*) as obs_count,
              min(o.start_time) as min_start_time,
              max(o.end_time) as max_end_time,
              sumMap(usage_details) as sum_usage_details,
              sumMap(cost_details) as sum_cost_details,
              anyLast(project_id) as project_id
        FROM observations o FINAL
        WHERE o.project_id = {projectId: String}
        ${traceTimestampFilter ? `AND o.start_time >= {observationsStartTime: DateTime64(3)} - ${TRACE_TO_OBSERVATIONS_INTERVAL}` : ""}
        GROUP BY o.trace_id
    ),
    session_data AS (
        SELECT
            t.session_id,
            anyLast(t.project_id) as project_id,
            max(t.timestamp) as max_timestamp,
            min(t.timestamp) as min_timestamp,
            groupArray(t.id) AS trace_ids,
            groupUniqArray(t.user_id) AS user_ids,
            count(*) as trace_count,
            groupUniqArrayArray(t.tags) as trace_tags,
            -- Aggregate observations data at session level
            sum(o.obs_count) as total_observations,
            date_diff('milliseconds', min(min_start_time), max(max_end_time)) as duration,
            sumMap(o.sum_usage_details) as session_usage_details,
            sumMap(o.sum_cost_details) as session_cost_details,
            sumMap(o.sum_cost_details)['input'] as session_input_cost,
            sumMap(o.sum_cost_details)['output'] as session_output_cost,
            sumMap(o.sum_cost_details)['total'] as session_total_cost,
            sumMap(o.sum_usage_details)['input'] as session_input_usage,
            sumMap(o.sum_usage_details)['output'] as session_output_usage,
            sumMap(o.sum_usage_details)['total'] as session_total_usage
        FROM traces t FINAL
        LEFT JOIN observations_agg o
        ON t.id = o.trace_id AND t.project_id = o.project_id
        WHERE t.session_id IS NOT NULL
            AND t.project_id = {projectId: String}
            ${singleTraceFilter?.query ? ` AND ${singleTraceFilter.query}` : ""}
        GROUP BY t.session_id
    )
    SELECT ${select}
    FROM session_data s
    WHERE ${tracesFilterRes.query ? tracesFilterRes.query : ""}
    ${orderByToClickhouseSql(orderBy ?? null, sessionCols)}
    ${limit !== undefined && page !== undefined ? `LIMIT {limit: Int32} OFFSET {offset: Int32}` : ""}
    `;

  const obsStartTimeValue = traceTimestampFilter
    ? convertDateToClickhouseDateTime(traceTimestampFilter.value)
    : null;

  const res = await queryClickhouse<T>({
    query: query,
    params: {
      projectId,
      limit: limit,
      offset: (limit ?? 0) * (page ?? 0),
      ...tracesFilterRes.params,
      ...observationsStatsRes.params,
      ...scoresAvgFilterRes.params,
      ...singleTraceFilter?.params,
      ...(obsStartTimeValue
        ? { observationsStartTime: obsStartTimeValue }
        : {}),
    },
  });

  return res;
};

export const getTracesIdentifierForSession = async (
  projectId: string,
  sessionId: string,
) => {
  const query = `
    SELECT
      id,
      user_id,
      name,
      timestamp,
      project_id
    FROM traces
    WHERE (project_id = {projectId: String})
    AND (session_id = {sessionId: String})
    ORDER BY timestamp ASC
    LIMIT 1 BY id, project_id;
  `;

  const rows = await queryClickhouse<{
    id: string;
    user_id: string;
    name: string;
    timestamp: string;
  }>({
    query: query,
    params: {
      projectId,
      sessionId,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    timestamp: parseClickhouseUTCDateTimeFormat(row.timestamp),
  }));
};

export const deleteTraces = async (projectId: string, traceIds: string[]) => {
  const query = `
    DELETE FROM traces
    WHERE project_id = {projectId: String}
    AND id IN ({traceIds: Array(String)});
  `;
  await commandClickhouse({
    query: query,
    params: {
      projectId,
      traceIds,
    },
  });
};

export const getTotalUserCount = async (
  projectId: string,
  filter: FilterState,
  searchQuery?: string,
): Promise<{ totalCount: bigint }[]> => {
  const { tracesFilter } = getProjectIdDefaultFilter(projectId, {
    tracesPrefix: "t",
  });

  tracesFilter.push(
    ...createFilterFromFilterState(filter, tracesTableUiColumnDefinitions),
  );

  const tracesFilterRes = tracesFilter.apply();
  const search = clickhouseSearchCondition(searchQuery);

  const query = `
    SELECT COUNT(DISTINCT t.user_id) AS totalCount
    FROM traces t
    WHERE ${tracesFilterRes.query}
    ${search.query}
    AND t.user_id IS NOT NULL
    AND t.user_id != ''
  `;

  return queryClickhouse({
    query,
    params: {
      ...tracesFilterRes.params,
      ...search.params,
    },
  });
};

export const getUserMetrics = async (projectId: string, userIds: string[]) => {
  if (userIds.length === 0) {
    return [];
  }
  const query = `
    WITH observations_agg AS (
      SELECT o.trace_id,
             count(*) as obs_count,
             sumMap(usage_details) as sum_usage_details,
             sum(total_cost) as sum_total_cost,
             anyLast(project_id) as project_id
      FROM observations o FINAL
      WHERE o.project_id = {projectId: String}
      GROUP BY o.trace_id
    ),
    user_metric_data AS (
      SELECT t.user_id,
             max(t.timestamp) as max_timestamp,
             min(t.timestamp) as min_timestamp,
             count(*) as trace_count,
             sum(o.obs_count) as total_observations,
             sum(o.sum_total_cost) as session_total_cost,
             sumMap(o.sum_usage_details)['input'] as session_input_usage,
             sumMap(o.sum_usage_details)['output'] as session_output_usage,
             sumMap(o.sum_usage_details)['total'] as session_total_usage
      FROM traces t FINAL
      LEFT JOIN observations_agg o
      ON t.id = o.trace_id 
      AND t.project_id = o.project_id
      WHERE t.user_id IS NOT NULL
      AND t.user_id != ''
      AND t.user_id IN ({userIds: Array(String)})
      AND t.project_id = {projectId: String}
      GROUP BY t.user_id
    )
    SELECT user_id AS userId,
           min_timestamp as firstTrace,
           max_timestamp as lastTrace,
           trace_count as totalTraces,
           total_observations as totalObservations,
           session_input_usage as totalPromptTokens,
           session_output_usage as totalCompletionTokens,
           session_total_usage as totalTokens,
           session_total_cost as sumCalculatedTotalCost
    FROM user_metric_data umd
  `;

  return queryClickhouse<{
    userId: string;
    firstTrace: Date | null;
    lastTrace: Date | null;
    totalPromptTokens: bigint;
    totalCompletionTokens: bigint;
    totalTokens: bigint;
    totalObservations: bigint;
    totalTraces: bigint;
    sumCalculatedTotalCost: number;
  }>({
    query,
    params: {
      projectId,
      userIds,
    },
  });
};
