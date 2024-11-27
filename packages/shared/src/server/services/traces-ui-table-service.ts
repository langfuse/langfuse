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
import {
  OBSERVATIONS_TO_TRACE_INTERVAL,
  SCORE_TO_TRACE_OBSERVATIONS_INTERVAL,
} from "../repositories/constants";

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
  latency: string | null;
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
    t.id as id,
    t.project_id as project_id,
    t.timestamp as timestamp,
    t.tags as tags,
    t.bookmarked as bookmarked,
    t.name as name,
    t.release as release,
    t.version as version,
    t.user_id as user_id,
    t.session_id as session_id,
    os.latency_milliseconds / 1000 as latency,
    os.cost_details as cost_details,
    os.usage_details as usage_details,
    os.level as level,
    os.observation_count as observation_count,
    s.scores_avg as scores_avg,
    t.public as public`,
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

  // const hasScoresFilter = tracesFilter.find(
  //   (f) => f.clickhouseTable === "scores",
  // );

  // const hasObservationsFilter = tracesFilter.find(
  //   (f) => f.clickhouseTable === "observations",
  // );

  const tracesFilterRes = tracesFilter.apply();
  const scoresFilterRes = scoresFilter.apply();
  const observationFilterRes = observationsFilter.apply();

  const search = clickhouseSearchCondition(searchQuery);

  const chOrderBy = orderByToClickhouseSql(
    [
      orderBy?.order && orderBy?.column === "timestamp"
        ? {
            column: "timestamp_to_date",
            order: orderBy.order,
          }
        : null,
      orderBy ?? null,
    ],
    [
      ...tracesTableUiColumnDefinitions,
      {
        clickhouseSelect: "toDate(t.timestamp)",
        uiTableName: "timestamp_to_date",
        uiTableId: "timestamp_to_date",
        clickhouseTableName: "observations",
      },
    ],
  );
  const query = `
    WITH obs_stats AS (
      select project_id,
             trace_id,
             uniqMerge(count) as observation_count,
             date_diff('milliseconds', min(min_start_time), greatest(max(max_end_time), max(max_start_time))) as latency_milliseconds,
             sumMap(sum_usage_details) as usage_details,
             sumMap(sum_cost_details) as cost_details,
             sum(sum_total_cost) as total_cost,
             multiIf(
                 arrayExists(x -> x = 'ERROR', groupUniqArrayArray(unique_levels)), 'ERROR',
                 arrayExists(x -> x = 'WARNING', groupUniqArrayArray(unique_levels)), 'WARNING',
                 arrayExists(x -> x = 'DEFAULT', groupUniqArrayArray(unique_levels)), 'DEFAULT',
                 'DEBUG'
             ) AS level
      from observation_stats
      where project_id = {projectId: String} 
      ${observationsFilter ? `AND ${observationFilterRes.query}` : ""}
      group by project_id, trace_id
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
        FROM scores s FINAL 
        WHERE project_id = {projectId: String}
        ${timeStampFilter ? `AND s.timestamp >= {traceTimestamp: DateTime64(3)} - ${SCORE_TO_TRACE_OBSERVATIONS_INTERVAL}` : ""}
        ${scoresFilterRes ? `AND ${scoresFilterRes.query}` : ""}
        GROUP BY project_id,
                  trace_id,
                  name
      ) tmp
      GROUP BY project_id, trace_id
    )
    SELECT ${select}
    FROM traces t FINAL 
    LEFT JOIN obs_stats os on os.project_id = t.project_id and os.trace_id = t.id
    LEFT JOIN scores_avg s on s.project_id = t.project_id and s.trace_id = t.id
    WHERE t.project_id = {projectId: String}
    ${tracesFilterRes ? `AND ${tracesFilterRes.query}` : ""}
    ${search.query}
    ${chOrderBy}
    ${limit !== undefined && page !== undefined ? `LIMIT {limit: Int32} OFFSET {offset: Int32}` : ""}
  `;

  const res = await queryClickhouse<T>({
    query: query,
    params: {
      limit: limit,
      offset: limit && page ? limit * page : 0,
      traceTimestamp: timeStampFilter?.value.getTime(),
      projectId: projectId,
      ...tracesFilterRes.params,
      ...observationFilterRes.params,
      ...scoresFilterRes.params,
      ...search.params,
    },
  });

  return res;
};
