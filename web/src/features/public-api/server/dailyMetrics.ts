import { convertApiProvidedFilterToClickhouseFilter } from "@/src/features/public-api/server/filter-builder";
import {
  convertDateToClickhouseDateTime,
  queryClickhouse,
  TRACE_TO_OBSERVATIONS_INTERVAL,
  type DateTimeFilter,
  getTimeframesTracesAMT,
  measureAndReturn,
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
  const hasTracesFilter = filter.some((f) => f.clickhouseTable === "traces");
  const tracesFilter = filter.filter((f) => f.clickhouseTable === "traces");
  const appliedFilter = filter.apply();
  const appliedTracesFilter = tracesFilter.apply();

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
        sum(arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'input') > 0, o.usage_details)))) as inputUsage,
        sum(arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, o.usage_details)))) as outputUsage,
        sumMap(o.usage_details)['total'] as totalUsage,
        sum(coalesce(o.total_cost, 0)) as totalCost
      FROM __TRACE_TABLE__ t FINAL
      LEFT JOIN observations o FINAL on o.trace_id = t.id AND o.project_id = t.project_id
      WHERE o.project_id = {projectId: String} 
      AND t.project_id = {projectId: String}
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
      FROM __TRACE_TABLE__ t FINAL
      WHERE t.project_id = {projectId: String}
      ${hasTracesFilter ? `AND ${appliedTracesFilter.query}` : ""}
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

  const timestamp = props.fromTimestamp
    ? new Date(props.fromTimestamp)
    : timeFilter?.value;

  return measureAndReturn({
    operationName: "generateDailyMetrics",
    projectId: props.projectId,
    minStartTime: timestamp,
    input: {
      params: {
        ...appliedTracesFilter.params,
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
      tags: {
        feature: "tracing",
        type: "trace",
        kind: "daily_metrics",
        projectId: props.projectId,
        operation_name: "generateDailyMetrics",
      },
      timestamp,
    },
    existingExecution: async (input) => {
      const result = await queryClickhouse<{
        date: string;
        countTraces: number;
        countObservations: number;
        totalCost: number;
        usage: (string | null)[][];
      }>({
        query: query.replaceAll("__TRACE_TABLE__", "traces"),
        params: input.params,
        tags: { ...input.tags, experiment_amt: "original" },
        clickhouseConfigs: {
          request_timeout: 60_000, // Use 1 minute timeout for daily metrics
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
    },
    newExecution: async (input) => {
      const traceAmt = getTimeframesTracesAMT(input.timestamp);
      const result = await queryClickhouse<{
        date: string;
        countTraces: number;
        countObservations: number;
        totalCost: number;
        usage: (string | null)[][];
      }>({
        query: query.replaceAll("__TRACE_TABLE__", traceAmt),
        params: input.params,
        tags: { ...input.tags, experiment_amt: "new" },
        clickhouseConfigs: {
          request_timeout: 60_000, // Use 1 minute timeout for daily metrics
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
    },
  });
};

export const getDailyMetricsCount = async (props: QueryType) => {
  const filter = convertApiProvidedFilterToClickhouseFilter(
    props,
    filterParams,
  );
  const appliedFilter = filter
    .filter((f) => f.clickhouseTable === "traces")
    .apply();

  const query = `
    SELECT count(distinct toDate(timestamp)) as count
    FROM __TRACE_TABLE__ t
    WHERE project_id = {projectId: String}
    ${filter.length() > 0 ? `AND ${appliedFilter.query}` : ""}
  `;

  const timestamp = props.fromTimestamp
    ? new Date(props.fromTimestamp)
    : undefined;

  return measureAndReturn({
    operationName: "getDailyMetricsCount",
    projectId: props.projectId,
    minStartTime: timestamp,
    input: {
      params: { ...appliedFilter.params, projectId: props.projectId },
      tags: {
        feature: "tracing",
        type: "trace",
        kind: "daily_metrics_count",
        projectId: props.projectId,
        operation_name: "getDailyMetricsCount",
      },
      timestamp,
    },
    existingExecution: async (input) => {
      const records = await queryClickhouse<{ count: string }>({
        query: query.replace("__TRACE_TABLE__", "traces"),
        params: input.params,
        tags: { ...input.tags, experiment_amt: "original" },
      });
      return records.map((record) => Number(record.count)).shift();
    },
    newExecution: async (input) => {
      const traceAmt = getTimeframesTracesAMT(input.timestamp);
      const records = await queryClickhouse<{ count: string }>({
        query: query.replace("__TRACE_TABLE__", traceAmt),
        params: input.params,
        tags: { ...input.tags, experiment_amt: "new" },
      });
      return records.map((record) => Number(record.count)).shift();
    },
  });
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
    id: "traceEnvironment",
    clickhouseSelect: "environment",
    filterType: "StringOptionsFilter",
    clickhouseTable: "traces",
    clickhousePrefix: "t",
  },
  {
    id: "observationEnvironment",
    clickhouseSelect: "environment",
    filterType: "StringOptionsFilter",
    clickhouseTable: "observations",
    clickhousePrefix: "o",
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
