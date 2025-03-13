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
import { TraceRecordReadType } from "../repositories/definitions";
import Decimal from "decimal.js";
import { ScoreAggregate } from "../../features/scores";
import {
  OBSERVATIONS_TO_TRACE_INTERVAL,
  SCORE_TO_TRACE_OBSERVATIONS_INTERVAL,
  ObservationLevelType,
  reduceUsageOrCostDetails,
  parseClickhouseUTCDateTimeFormat,
  queryClickhouse,
} from "../repositories";

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
  | "environment"
  | "tags"
  | "public"
>;

export type TracesAllUiReturnType = {
  id: string;
  timestamp: Date;
  name: string | null;
  projectId: string;
  userId: string | null;
  release: string | null;
  version: string | null;
  public: boolean;
  bookmarked: boolean;
  environment: string | null;
  sessionId: string | null;
  tags: string[];
};

export type TracesMetricsUiReturnType = {
  id: string;
  projectId: string;
  promptTokens: bigint;
  completionTokens: bigint;
  totalTokens: bigint;
  latency: number | null;
  level: ObservationLevelType;
  observationCount: bigint;
  calculatedTotalCost: Decimal | null;
  calculatedInputCost: Decimal | null;
  calculatedOutputCost: Decimal | null;
  scores: ScoreAggregate;
  usageDetails: Record<string, number>;
  costDetails: Record<string, number>;
  errorCount: bigint;
  warningCount: bigint;
  defaultCount: bigint;
  debugCount: bigint;
};

export const convertToUiTableRows = (
  row: TracesTableReturnType,
): TracesAllUiReturnType => {
  return {
    id: row.id,
    projectId: row.project_id,
    timestamp: parseClickhouseUTCDateTimeFormat(row.timestamp),
    tags: row.tags,
    bookmarked: row.bookmarked,
    name: row.name ?? null,
    release: row.release ?? null,
    version: row.version ?? null,
    userId: row.user_id ?? null,
    environment: row.environment ?? null,
    sessionId: row.session_id ?? null,
    public: row.public,
  };
};

export const convertToUITableMetrics = (
  row: TracesTableMetricsClickhouseReturnType,
): Omit<TracesMetricsUiReturnType, "scores"> => {
  const usageDetails = reduceUsageOrCostDetails(row.usage_details);

  return {
    id: row.id,
    projectId: row.project_id,
    latency: Number(row.latency),
    promptTokens: BigInt(usageDetails.input ?? 0),
    completionTokens: BigInt(usageDetails.output ?? 0),
    totalTokens: BigInt(usageDetails.total ?? 0),
    usageDetails: Object.fromEntries(
      Object.entries(row.usage_details).map(([key, value]) => [
        key,
        Number(value),
      ]),
    ),
    costDetails: Object.fromEntries(
      Object.entries(row.cost_details).map(([key, value]) => [
        key,
        Number(value),
      ]),
    ),
    observationCount: BigInt(row.observation_count ?? 0),
    calculatedTotalCost: row.cost_details?.total
      ? new Decimal(row.cost_details.total)
      : null,
    calculatedInputCost: row.cost_details?.input
      ? new Decimal(row.cost_details.input)
      : null,
    calculatedOutputCost: row.cost_details?.output
      ? new Decimal(row.cost_details.output)
      : null,
    level: row.level,
    debugCount: BigInt(row.debug_count ?? 0),
    warningCount: BigInt(row.warning_count ?? 0),
    errorCount: BigInt(row.error_count ?? 0),
    defaultCount: BigInt(row.default_count ?? 0),
  };
};

export type TracesTableMetricsClickhouseReturnType = {
  id: string;
  project_id: string;
  timestamp: Date;
  level: ObservationLevelType;
  observation_count: number | null;
  latency: string | null;
  usage_details: Record<string, number>;
  cost_details: Record<string, number>;
  scores_avg: Array<{ name: string; avg_value: number }>;
  error_count: number | null;
  warning_count: number | null;
  default_count: number | null;
  debug_count: number | null;
};

export type FetchTracesTableProps = {
  select: "count" | "rows" | "metrics";
  projectId: string;
  filter: FilterState;
  searchQuery?: string;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
  tags?: Record<string, string>;
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
    select: "count",
    tags: { kind: "count" },
    ...props,
  });

  const converted = countRows.map((row) => ({
    count: Number(row.count),
  }));

  return converted.length > 0 ? converted[0].count : 0;
};

export const getTracesTableMetrics = async (props: {
  projectId: string;
  filter: FilterState;
  searchQuery?: string;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
}): Promise<Array<Omit<TracesMetricsUiReturnType, "scores">>> => {
  const countRows =
    await getTracesTableGeneric<TracesTableMetricsClickhouseReturnType>({
      select: "metrics",
      tags: { kind: "analytic" },
      ...props,
    });

  return countRows.map(convertToUITableMetrics);
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
    select: "rows",
    tags: { kind: "list" },
    projectId,
    filter,
    searchQuery,
    orderBy,
    limit,
    page,
  });

  return rows.map(convertToUiTableRows);
};

const getTracesTableGeneric = async <T>(props: FetchTracesTableProps) => {
  const { select, projectId, filter, orderBy, limit, page, searchQuery } =
    props;

  let sqlSelect: string;
  switch (select) {
    case "count":
      sqlSelect = "count(*) as count";
      break;
    case "metrics":
      sqlSelect = `
        t.id as id,
        t.project_id as project_id,
        t.timestamp as timestamp,
        os.latency_milliseconds / 1000 as latency,
        os.cost_details as cost_details,
        os.usage_details as usage_details,
        os.aggregated_level as level,
        os.error_count as error_count,
        os.warning_count as warning_count,
        os.default_count as default_count,
        os.debug_count as debug_count,
        os.observation_count as observation_count,
        s.scores_avg as scores_avg,
        t.public as public`;
      break;
    case "rows":
      sqlSelect = `
        t.id as id,
        t.project_id as project_id,
        t.timestamp as timestamp,
        t.tags as tags,
        t.bookmarked as bookmarked,
        t.name as name,
        t.release as release,
        t.version as version,
        t.user_id as user_id,
        t.environment as environment,
        t.session_id as session_id,
        t.public as public`;
      break;
    default:
      throw new Error(`Unknown select type: ${select}`);
  }

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

  const requiresScoresJoin =
    tracesFilter.find((f) => f.clickhouseTable === "scores") !== undefined ||
    tracesTableUiColumnDefinitions.find(
      (c) =>
        c.uiTableName === orderBy?.column || c.uiTableId === orderBy?.column,
    )?.clickhouseTableName === "scores";

  const requiresObservationsJoin =
    tracesFilter.find((f) => f.clickhouseTable === "observations") !==
      undefined ||
    tracesTableUiColumnDefinitions.find(
      (c) =>
        c.uiTableName === orderBy?.column || c.uiTableId === orderBy?.column,
    )?.clickhouseTableName === "observations";

  const tracesFilterRes = tracesFilter.apply();
  const scoresFilterRes = scoresFilter.apply();
  const observationFilterRes = observationsFilter.apply();

  const search = clickhouseSearchCondition(searchQuery);

  const defaultOrder = orderBy?.order && orderBy?.column === "timestamp";
  const orderByCols = [
    ...tracesTableUiColumnDefinitions,
    {
      clickhouseSelect: "toDate(t.timestamp)",
      uiTableName: "timestamp_to_date",
      uiTableId: "timestamp_to_date",
      clickhouseTableName: "traces",
    },
    {
      clickhouseSelect: "t.event_ts",
      uiTableName: "event_ts",
      uiTableId: "event_ts",
      clickhouseTableName: "traces",
    },
  ];
  const chOrderBy = orderByToClickhouseSql(
    [
      defaultOrder
        ? [
            {
              column: "timestamp_to_date",
              order: orderBy.order,
            },
            { column: "timestamp", order: orderBy.order },
            { column: "event_ts", order: "DESC" as "DESC" },
          ]
        : null,
      orderBy ?? null,
    ].flat(),
    orderByCols,
  );

  // complex query ahead:
  // - we only join scores and observations if we really need them to speed up default views
  // - we use FINAL on traces only in case we not need to order by something different than time. Otherwise we cannot guarantee correct reads.
  // - we filter the observations and scores as much as possible before joining them to traces.
  // - we order by todate(timestamp), event_ts desc per default and do not use FINAL.
  //   In this case, CH is able to read the data only from the latest date from disk and filtering them in memory. No need to read all data e.g. for 1 month from disk.

  const query = `
    WITH observations_stats AS (
      SELECT
        COUNT(*) AS observation_count,
          sumMap(usage_details) as usage_details,
          SUM(total_cost) AS total_cost,
          date_diff('millisecond', least(min(start_time), min(end_time)), greatest(max(start_time), max(end_time))) as latency_milliseconds,
          countIf(level = 'ERROR') as error_count,
          countIf(level = 'WARNING') as warning_count,
          countIf(level = 'DEFAULT') as default_count,
          countIf(level = 'DEBUG') as debug_count,
          multiIf(
            arrayExists(x -> x = 'ERROR', groupArray(level)), 'ERROR',
            arrayExists(x -> x = 'WARNING', groupArray(level)), 'WARNING',
            arrayExists(x -> x = 'DEFAULT', groupArray(level)), 'DEFAULT',
            'DEBUG'
          ) AS aggregated_level,
          sumMap(cost_details) as cost_details,
          trace_id,
          project_id
      FROM observations o FINAL 
      WHERE o.project_id = {projectId: String}
      ${timeStampFilter ? `AND o.start_time >= {traceTimestamp: DateTime64(3)} - ${OBSERVATIONS_TO_TRACE_INTERVAL}` : ""}
      ${observationsFilter ? `AND ${observationFilterRes.query}` : ""}
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
    SELECT ${sqlSelect}
    -- FINAL is used for non default ordering and count.
    FROM traces t  ${["metrics", "rows"].includes(select) && defaultOrder ? "" : "FINAL"}
    ${select === "metrics" || requiresObservationsJoin ? `LEFT JOIN observations_stats os on os.project_id = t.project_id and os.trace_id = t.id` : ""}
    ${select === "metrics" || requiresScoresJoin ? `LEFT JOIN scores_avg s on s.project_id = t.project_id and s.trace_id = t.id` : ""}
    WHERE t.project_id = {projectId: String}
    ${tracesFilterRes ? `AND ${tracesFilterRes.query}` : ""}
    ${search.query}
    ${chOrderBy}
    -- This is used for metrics and row queries. Count has only one result.
    -- This is only used for default ordering. Otherwise, we use final.
    ${["metrics", "rows"].includes(select) && defaultOrder ? "LIMIT 1 BY id, project_id" : ""}
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
    tags: {
      ...(props.tags ?? {}),
      feature: "tracing",
      type: "traces-table",
      projectId,
    },
  });

  return res;
};
