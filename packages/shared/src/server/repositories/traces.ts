import {
  parseClickhouseUTCDateTimeFormat,
  queryClickhouse,
} from "./clickhouse";
import {
  createFilterFromFilterState,
  getProjectIdDefaultFilter,
} from "../queries/clickhouse-filter/factory";
import { ObservationLevel, Trace } from "@prisma/client";
import { FilterState } from "../../types";
import { logger } from "../logger";
import { FilterList } from "../queries/clickhouse-filter/clickhouse-filter";
import { TraceRecordReadType } from "./definitions";
import { tracesTableUiColumnDefinitions } from "../../tableDefinitions/mapTracesTable";
import { TableCount } from "./types";
import { OrderByState } from "../../interfaces/orderBy";
import { orderByToClickhouseSql } from "../queries/clickhouse-filter/orderby-factory";
import { UiColumnMapping } from "../../tableDefinitions";
import { sessionCols } from "../../tableDefinitions/mapSessionTable";

const convertClickhouseToDomain = (record: TraceRecordReadType): Trace => {
  return {
    id: record.id,
    projectId: record.project_id,
    name: record.name ?? null,
    timestamp: parseClickhouseUTCDateTimeFormat(record.timestamp),
    tags: record.tags,
    bookmarked: record.bookmarked,
    release: record.release ?? null,
    version: record.version ?? null,
    userId: record.user_id ?? null,
    sessionId: record.session_id ?? null,
    public: record.public,
    input: record.input ?? null,
    output: record.output ?? null,
    metadata: record.metadata,
    createdAt: parseClickhouseUTCDateTimeFormat(record.created_at),
    updatedAt: parseClickhouseUTCDateTimeFormat(record.updated_at),
    externalId: null,
  };
};

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
  | "metadata"
  | "public"
> & {
  level: ObservationLevel;
  observation_count: number | null;
  latency: string | null;
  usage_details: Record<string, number>;
  cost_details: Record<string, number>;
  scores_avg: Array<{ name: string; avg_value: number }>;
};

export const getTracesTableCount = async (
  projectId: string,
  filter: FilterState,
  orderBy?: OrderByState,
  limit?: number,
  offset?: number,
) => {
  const countRows = await getTracesTableGeneric<{ count: string }>({
    select: "count(*) as count",
    projectId,
    filter,
    orderBy,
    limit,
    offset,
  });

  const converted = countRows.map((row) => ({
    count: Number(row.count),
  }));

  return converted.length > 0 ? converted[0].count : 0;
};

export const getTracesTable = async (
  projectId: string,
  filter: FilterState,
  orderBy?: OrderByState,
  limit?: number,
  offset?: number,
) => {
  const rows = await getTracesTableGeneric<TracesTableReturnType>({
    select: `
    t.id, 
    t.project_id, 
    t.timestamp, 
    t.tags, 
    t.bookmarked, 
    t.name, 
    t.release, 
    t.version, 
    t.user_id, 
    t.session_id,
    os.latencyMs as latency,
    os.cost_details as cost_details,
    os.usage_details as usage_details,
    os.level as level,
    os.observation_count as observation_count,
    s.scores_avg as scores_avg,
    t.metadata,
    t.public`,
    projectId,
    filter,
    orderBy,
    limit,
    offset,
  });

  return rows;
};

type FetchTracesTableProps = {
  select: string;
  projectId: string;
  filter: FilterState;
  orderBy?: OrderByState;
  limit?: number;
  offset?: number;
};

const getTracesTableGeneric = async <T>(props: FetchTracesTableProps) => {
  const { select, projectId, filter, orderBy, limit, offset } = props;
  logger.info(`input filter ${JSON.stringify(filter)}`);
  const { tracesFilter, scoresFilter, observationsFilter } =
    getProjectIdDefaultFilter(projectId, { tracesPrefix: "t" });

  tracesFilter.push(
    ...createFilterFromFilterState(filter, tracesTableUiColumnDefinitions),
  );

  const tracesFilterRes = tracesFilter.apply();
  const scoresAvgFilterRes = scoresFilter.apply();
  const observationsStatsRes = observationsFilter.apply();

  const query = `
  WITH observations_stats AS (
  SELECT
    COUNT(*) AS observation_count,
      sumMap(usage_details) as usage_details,
      SUM(total_cost) AS total_cost,
      date_diff('seconds', least(min(start_time), min(end_time)), greatest(max(start_time), max(end_time))) as latencyMs,
      multiIf(
        arrayExists(x -> x = 'ERROR', groupArray(level)), 'ERROR',
        arrayExists(x -> x = 'WARNING', groupArray(level)), 'WARNING',
        arrayExists(x -> x = 'DEFAULT', groupArray(level)), 'DEFAULT',
        'DEBUG'
      ) AS level,
      sumMap(cost_details) as cost_details,
      trace_id,
      project_id
    FROM
        observations final
    WHERE ${observationsStatsRes.query}
    group by trace_id, project_id
),

         scores_avg AS (SELECT project_id,
                                trace_id,
                                groupArray(tuple(name, avg_value)) AS "scores_avg"
                          FROM (
                                  SELECT project_id,
                                          trace_id,
                                          name,
                                          avg(value) avg_value
                                  FROM scores final
                                  WHERE ${scoresAvgFilterRes.query}
                                  GROUP BY project_id,
                                            trace_id,
                                            name
                                  ) tmp
                          GROUP BY project_id,
                                  trace_id)
      select 
       ${select}
      from traces t final
              left join observations_stats os on os.project_id = t.project_id and os.trace_id = t.id
              left join scores_avg s on s.project_id = t.project_id and s.trace_id = t.id

      WHERE ${tracesFilterRes.query}
      ${orderByToClickhouseSql(orderBy ?? null, tracesTableUiColumnDefinitions)}
      ${limit !== undefined && offset !== undefined ? `LIMIT {limit: Int32} OFFSET {offset: Int32}` : ""}
    `;

  return await queryClickhouse<T>({
    query: query,
    params: {
      limit: limit,
      offset: offset,
      ...tracesFilterRes.params,
      ...observationsStatsRes.params,
      ...scoresAvgFilterRes.params,
    },
  });
};

export const getTraceByIdOrThrow = async (
  traceId: string,
  projectId: string,
) => {
  const query = `SELECT * FROM traces where id = {traceId: String} and project_id = {projectId: String} order by event_ts desc LIMIT 1 by id, project_id`;
  const records = await queryClickhouse<TraceRecordReadType>({
    query,
    params: { traceId, projectId },
  });

  const res = records.map(convertClickhouseToDomain);

  if (res.length !== 1) {
    const errorMessage = `Trace not found or multiple traces found for traceId: ${traceId}, projectId: ${projectId}`;
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }
  return res[0] as Trace;
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

  const query = `
      select 
        name as name,
        count(*) as count
      from traces t final
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

export type GroupedTracesQueryProp = {
  projectId: string;
  filter: FilterState;
  sessionIdNullFilter?: boolean;
  columns?: UiColumnMapping[];
};

export const getTracesGroupedByTags = async (props: GroupedTracesQueryProp) => {
  const { projectId, filter, sessionIdNullFilter, columns } = props;

  const chFilter = createFilterFromFilterState(
    filter,
    columns ?? tracesTableUiColumnDefinitions,
  );

  const filterRes = new FilterList(chFilter).apply();

  const query = `
      select 
        distinct(arrayJoin(tags)) as value
      from traces t final
      WHERE t.project_id = {projectId: String}
      ${sessionIdNullFilter ? "AND t.session_id IS NOT NULL" : ""}
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

export const getTracesGroupedByUserIds = async (
  props: GroupedTracesQueryProp,
) => {
  const {
    projectId,
    filter,
    sessionIdNullFilter: sessionIdNotNullFilter,
    columns,
  } = props;

  const chFilter = filter
    ? createFilterFromFilterState(
        filter,
        columns ?? tracesTableUiColumnDefinitions,
      )
    : undefined;

  const appliedFilter = chFilter ? new FilterList(chFilter).apply() : undefined;

  const query = `
      select distinct user_id as user_id
      from traces t final
      WHERE t.project_id = {projectId: String}
      ${sessionIdNotNullFilter ? "AND t.session_id IS NOT NULL" : ""}
      ${appliedFilter?.query ? `AND ${appliedFilter.query}` : ""}
      LIMIT 1000;
    `;

  const rows = await queryClickhouse<{
    user_id: string;
  }>({
    query: query,
    params: {
      projectId: projectId,
      ...(appliedFilter ? appliedFilter.params : {}),
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
  offset?: number;
}) => {
  const rows = await getSessionsTableGeneric<{ count: string }>({
    select: `
      count(*) as count
    `,
    projectId: props.projectId,
    filter: props.filter,
    orderBy: props.orderBy,
    limit: props.limit,
    offset: props.offset,
  });

  return rows;
};

export const getSessionsTable = async (props: {
  projectId: string;
  filter: FilterState;
  orderBy?: OrderByState;
  limit?: number;
  offset?: number;
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
    offset: props.offset,
  });

  return rows;
};

const getSessionsTableGeneric = async <T>(props: FetchTracesTableProps) => {
  const { select, projectId, filter, orderBy, limit, offset } = props;

  const { tracesFilter, scoresFilter, observationsFilter } =
    getProjectIdDefaultFilter(projectId, { tracesPrefix: "s" });

  tracesFilter.push(...createFilterFromFilterState(filter, sessionCols));

  const tracesFilterRes = tracesFilter.apply();
  const scoresAvgFilterRes = scoresFilter.apply();
  const observationsStatsRes = observationsFilter.apply();

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
            date_diff('seconds', min(min_start_time), max(max_end_time)) as duration,
            sumMap(o.sum_usage_details) as session_usage_details,
            sumMap(o.sum_cost_details) as session_cost_details,
            sumMap(o.sum_cost_details)['input'] as session_input_cost,
            sumMap(o.sum_cost_details)['output'] as session_output_cost,
            sumMap(o.sum_cost_details)['total'] as session_total_cost,
            sumMap(o.sum_usage_details)['input'] as session_input_usage,
            sumMap(o.sum_usage_details)['output'] as session_output_usage,
            sumMap(o.sum_usage_details)['total'] as session_total_usage
        FROM traces t FINAL
        LEFT JOIN observations_agg o ON t.id = o.trace_id AND t.project_id = o.project_id
        WHERE t.session_id IS NOT NULL
            AND t.project_id = {projectId: String}
        GROUP BY t.session_id
    )
    SELECT ${select}
    FROM session_data s
    WHERE ${tracesFilterRes.query ? tracesFilterRes.query : ""}
    ${orderByToClickhouseSql(orderBy ?? null, sessionCols)}
    LIMIT 50;`;

  const res = await queryClickhouse<T>({
    query: query,
    params: {
      projectId,
      limit: limit,
      offset: offset,
      ...tracesFilterRes.params,
      ...observationsStatsRes.params,
      ...scoresAvgFilterRes.params,
    },
  });

  return res;
};

export const getTracesForSession = async (
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
      WHERE (project_id = {projectId: String}) AND (session_id = {sessionId: String})
      ORDER BY timestamp ASC
      LIMIT 1 BY
          id,
          project_id;
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
  console.log(rows);
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    timestamp: parseClickhouseUTCDateTimeFormat(row.timestamp),
  }));
};
