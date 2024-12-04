import { convertApiProvidedFilterToClickhouseFilter } from "@/src/features/public-api/server/filter-builder";
import {
  convertDateToClickhouseDateTime,
  queryClickhouse,
  TRACE_TO_OBSERVATIONS_INTERVAL,
  type DateTimeFilter,
} from "@langfuse/shared/src/server";

type QueryType = {
  page: number;
  limit: number;
  projectId: string;
  userId?: string;
  tags?: string | string[];
  traceName?: string;
  fromTimestamp?: string;
  toTimestamp?: string;
};

export const generateDailyMetrics = async (props: QueryType) => {
  const filter = convertApiProvidedFilterToClickhouseFilter(
    props,
    filterParams,
  );
  const appliedFilter = filter.apply();

  const timeFilter = filter.find(
    (f) =>
      f.clickhouseTable === "traces" &&
      f.field.includes("timestamp") &&
      (f.operator === ">=" || f.operator === ">"),
  ) as DateTimeFilter | undefined;

  const query = `
    WITH model_usage AS (
      SELECT
        toDate(o.start_time) as date,
        o.provided_model_name as model,
        count(o.id) as countObservations,
        count(distinct t.id) as countTraces,
        sumMap(o.usage_details)['input'] as inputUsage,
        sumMap(o.usage_details)['output'] as outputUsage,
        sumMap(o.usage_details)['total'] as totalUsage,
        sum(coalesce(o.total_cost, 0)) as totalCost
      FROM traces t FINAL
      LEFT JOIN observations o FINAL on o.trace_id = t.id AND o.project_id = t.project_id
      WHERE o.project_id = {projectId: String} 
      ${filter.length() > 0 ? `AND ${appliedFilter.query}` : ""}
      ${timeFilter ? `AND start_time >= {cteTimeFilter: DateTime64(3)} - ${TRACE_TO_OBSERVATIONS_INTERVAL}` : ""}
      GROUP BY date, model
    ), daily_model_usage AS (
      SELECT
        "date",
        sum(mu.countObservations) as countObservations,
        sum(mu.totalCost) as totalCost,
        groupArray(tuple(
          mu.model,
          mu.inputUsage,
          mu.outputUsage,
          mu.totalUsage,
          mu.totalCost,
          mu.countObservations,
          mu.countTraces
        )) as daily_usage_tuple
      FROM model_usage mu
      GROUP BY date
    ), trace_usage AS (
      SELECT
        toDate(t.timestamp) as date,
        count(t.id) as countTraces
      FROM traces t FINAL
      WHERE t.project_id = {projectId: String}
      ${filter.length() > 0 ? `AND ${appliedFilter.query}` : ""}
      GROUP BY date
    )
      
    SELECT
      COALESCE(dmu.date, tu.date) as date,
      COALESCE(tu.countTraces, 0) as countTraces,
      COALESCE(dmu.countObservations, 0) as countObservations,
      COALESCE(dmu.totalCost, 0) as totalCost,
      dmu.daily_usage_tuple as usage  
    FROM daily_model_usage dmu    
    FULL OUTER JOIN trace_usage tu ON dmu.date = tu.date
    ORDER BY date DESC
    ${props.limit !== undefined && props.page !== undefined ? `LIMIT {limit: Int32} OFFSET {offset: Int32}` : ""}
  `;

  const result = await queryClickhouse<{
    date: string;
    countTraces: number;
    countObservations: number;
    totalCost: number;
    usage: (string | null)[][];
  }>({
    query,
    params: {
      ...appliedFilter.params,
      projectId: props.projectId,
      ...(props.limit !== undefined ? { limit: props.limit } : {}),
      ...(props.page !== undefined
        ? { offset: (props.page - 1) * props.limit }
        : {}),
      ...(timeFilter
        ? {
            cteTimeFilter: convertDateToClickhouseDateTime(timeFilter.value),
          }
        : {}),
    },
  });

  return result.map((record) => ({
    date: record.date,
    countTraces: Number(record.countTraces),
    countObservations: Number(record.countObservations),
    totalCost: Number(record.totalCost),
    usage: record.usage.map((u) => ({
      model: u[0],
      inputUsage: Number(u[1]),
      outputUsage: Number(u[2]),
      totalUsage: Number(u[3]),
      totalCost: Number(u[4]),
      countObservations: Number(u[5]),
      countTraces: Number(u[6]),
    })),
  }));
};

export const getDailyMetricsCount = async (props: QueryType) => {
  const filter = convertApiProvidedFilterToClickhouseFilter(
    props,
    filterParams,
  );
  const appliedFilter = filter.apply();

  const query = `
    SELECT count(distinct toDate(timestamp)) as count
    FROM traces t
    WHERE project_id = {projectId: String}
    ${filter.length() > 0 ? `AND ${appliedFilter.query}` : ""}
  `;

  const records = await queryClickhouse<{ count: string }>({
    query,
    params: { ...appliedFilter.params, projectId: props.projectId },
  });
  return records.map((record) => Number(record.count)).shift();
};

const filterParams = [
  {
    id: "userId",
    clickhouseSelect: "user_id",
    filterType: "StringFilter",
    clickhouseTable: "traces",
    clickhousePrefix: "t",
  },
  {
    id: "traceName",
    clickhouseSelect: "name",
    filterType: "StringFilter",
    clickhouseTable: "traces",
    clickhousePrefix: "t",
  },
  {
    id: "tags",
    clickhouseSelect: "tags",
    filterType: "ArrayOptionsFilter",
    clickhouseTable: "traces",
    clickhousePrefix: "t",
  },
  {
    id: "fromTimestamp",
    clickhouseSelect: "timestamp",
    operator: ">=" as const,
    filterType: "DateTimeFilter",
    clickhouseTable: "traces",
    clickhousePrefix: "t",
  },
  {
    id: "toTimestamp",
    clickhouseSelect: "timestamp",
    operator: "<" as const,
    filterType: "DateTimeFilter",
    clickhouseTable: "traces",
    clickhousePrefix: "t",
  },
];
