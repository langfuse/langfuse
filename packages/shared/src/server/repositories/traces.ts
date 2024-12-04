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
import { FilterState } from "../../types";
import {
  DateTimeFilter,
  FilterList,
  StringFilter,
} from "../queries/clickhouse-sql/clickhouse-filter";
import { TraceRecordReadType } from "./definitions";
import { tracesTableUiColumnDefinitions } from "../../tableDefinitions/mapTracesTable";
import { OrderByState } from "../../interfaces/orderBy";
import { orderByToClickhouseSql } from "../queries/clickhouse-sql/orderby-factory";
import { UiColumnMapping } from "../../tableDefinitions";
import { sessionCols } from "../../tableDefinitions/mapSessionTable";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import { convertClickhouseToDomain } from "./traces_converters";
import { clickhouseSearchCondition } from "../queries/clickhouse-sql/search";
import { TRACE_TO_OBSERVATIONS_INTERVAL } from "./constants";
import { FetchTracesTableProps } from "../services/traces-ui-table-service";

export const checkTraceExists = async (
  projectId: string,
  traceId: string,
  timestamp: Date | undefined,
  filter: FilterState,
): Promise<boolean> => {
  const { tracesFilter } = getProjectIdDefaultFilter(projectId, {
    tracesPrefix: "t",
  });

  tracesFilter.push(
    ...createFilterFromFilterState(filter, tracesTableUiColumnDefinitions),
    new StringFilter({
      clickhouseTable: "t",
      field: "id",
      operator: "=",
      value: traceId,
    }),
  );

  const tracesFilterRes = tracesFilter.apply();

  const query = `
    SELECT id, project_id
    FROM traces t FINAL
    WHERE ${tracesFilterRes.query}
    ${timestamp ? `AND timestamp >= {timestamp: DateTime64(3)} - ${TRACE_TO_OBSERVATIONS_INTERVAL}` : ""}
  `;

  const rows = await queryClickhouse<{ id: string; project_id: string }>({
    query,
    params: {
      ...tracesFilterRes.params,
      ...(timestamp
        ? { timestamp: convertDateToClickhouseDateTime(timestamp) }
        : {}),
    },
  });

  return rows.length > 0;
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

export const getTraceCountsByProjectInCreationInterval = async ({
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
    FROM traces
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
  });

  return rows.map((row) => ({
    projectId: row.project_id,
    count: Number(row.count),
  }));
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

export type FetchSessionsTableProps = {
  select: string;
  projectId: string;
  filter: FilterState;
  searchQuery?: string;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
};

const getSessionsTableGeneric = async <T>(props: FetchSessionsTableProps) => {
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
      offset: limit && page ? limit * page : 0,
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
  // this query uses window functions on observations + traces to always get only the first row and thereby remove deduplicates
  // we filter wherever possible by project id and user id
  const query = `
      WITH stats as (
        SELECT
            t.user_id as user_id,
            count(distinct o.id) as obs_count,
            sumMap(usage_details) as sum_usage_details,
            sum(total_cost) as sum_total_cost,
            max(t.timestamp) as max_timestamp,
            min(t.timestamp) as min_timestamp,
            count(distinct t.id) as trace_count
        FROM
            (
                SELECT
                    o.project_id,
                    o.trace_id,
                    o.usage_details,
                    o.total_cost,
                    id,
                    ROW_NUMBER() OVER (
                        PARTITION BY id
                        ORDER BY
                            event_ts DESC
                    ) AS rn
                FROM
                    observations o
                WHERE
                    o.project_id = {projectId: String }
                    AND o.trace_id in (
                        SELECT
                            distinct id
                        from
                            traces
                        where
                            user_id IN ({userIds: Array(String) })
                            AND project_id = {projectId: String }
                    )
                    AND o.type = 'GENERATION'
            ) as o
            JOIN (
                SELECT
                    t.id,
                    t.user_id,
                    t.project_id,
                    t.timestamp,
                    ROW_NUMBER() OVER (
                        PARTITION BY id
                        ORDER BY
                            event_ts DESC
                    ) AS rn
                FROM
                    traces t
                WHERE
                    t.user_id IN ({userIds: Array(String) })
                    AND t.project_id = {projectId: String }
            ) as t on t.id = o.trace_id
            and t.project_id = o.project_id
        WHERE
            o.rn = 1
            and t.rn = 1
        group by
            t.user_id
    )
    SELECT
        sum_usage_details [ 'input' ] as input_usage,
        sum_usage_details [ 'output' ] as output_usage,
        sum_usage_details [ 'total' ] as total_usage,
        obs_count,
        trace_count,
        user_id,
        sum_total_cost,
        max_timestamp,
        min_timestamp
    FROM
        stats

  `;

  const rows = await queryClickhouse<{
    user_id: string;
    max_timestamp: string | null;
    min_timestamp: string | null;
    input_usage: bigint;
    output_usage: bigint;
    total_usage: bigint;
    obs_count: bigint;
    trace_count: bigint;
    sum_total_cost: number;
  }>({
    query,
    params: {
      projectId,
      userIds,
    },
  });
  return rows.map((row) => ({
    userId: row.user_id,
    maxTimestamp: row.max_timestamp
      ? parseClickhouseUTCDateTimeFormat(row.max_timestamp)
      : null,
    minTimestamp: row.min_timestamp
      ? parseClickhouseUTCDateTimeFormat(row.min_timestamp)
      : null,
    inputUsage: Number(row.input_usage),
    outputUsage: Number(row.output_usage),
    totalUsage: Number(row.total_usage),
    observationCount: Number(row.obs_count),
    traceCount: Number(row.trace_count),
    totalCost: Number(row.sum_total_cost),
  }));
};
