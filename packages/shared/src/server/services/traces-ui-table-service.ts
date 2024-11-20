import { ObservationLevel } from "@prisma/client";
import { OrderByState } from "../../interfaces/orderBy";
import { tracesTableUiColumnDefinitions } from "../../tableDefinitions";
import { FilterState } from "../../types";
import {
  StringFilter,
  StringOptionsFilter,
  DateTimeFilter,
} from "../queries/clickhouse-sql/clickhouse-filter";
import {
  getProjectIdDefaultFilter,
  createFilterFromFilterState,
} from "../queries/clickhouse-sql/factory";
import { orderByToClickhouseSql } from "../queries/clickhouse-sql/orderby-factory";
import { clickhouseSearchCondition } from "../queries/clickhouse-sql/search";
import { convertToDomain } from "../repositories";
import { queryClickhouse } from "../repositories/clickhouse";
import { TraceRecordReadType } from "../repositories/definitions";

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

export type FetchTracesTableProps = {
  select: string;
  projectId: string;
  filter: FilterState;
  searchQuery?: string;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
};

export const getTracesTableCount = async (props: {
  projectId: string;
  filter: FilterState;
  searchQuery?: string;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
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
      offset: limit && page ? limit * page : 0,
      ...tracesFilterRes.params,
      ...observationFilterRes.params,
      ...scoresFilterRes.params,
      ...search.params,
    },
  });

  return res;
};
