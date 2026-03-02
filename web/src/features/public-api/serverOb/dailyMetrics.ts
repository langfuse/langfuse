import { convertApiProvidedFilterToClickhouseFilter } from "@langfuse/shared/src/server";
import {
  TRACE_TO_OBSERVATIONS_INTERVAL,
  type DateTimeFilter,
  measureAndReturn,
  DatabaseAdapterFactory,
  convertFilterParamsToPositional,
  convertDateToDateTime,
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

  const hasNonTimestampsFilter =
    (timeFilter && filter.length() > 1) || (!timeFilter && filter.length() > 0);

  // OceanBase/MySQL: DATE(), JSON_EXTRACT for usage, JSON_ARRAYAGG for daily_usage_tuple, no FULL OUTER JOIN
  const query = `
    WITH obs_dedup AS (
      SELECT o.*, ROW_NUMBER() OVER (PARTITION BY o.id, o.project_id ORDER BY o.start_time DESC) as rn
      FROM observations o
      ${hasNonTimestampsFilter ? "LEFT JOIN traces t ON o.trace_id = t.id AND o.project_id = t.project_id" : ""}
      WHERE o.project_id = {projectId: String}
      ${hasNonTimestampsFilter ? `AND t.project_id = {projectId: String} AND ${appliedFilter.query}` : ""}
      ${timeFilter ? `AND o.start_time >= DATE_SUB({cteTimeFilter: String}, ${TRACE_TO_OBSERVATIONS_INTERVAL})` : ""}
    ),
    model_usage AS (
      SELECT
        DATE(o.start_time) as date,
        COALESCE(o.provided_model_name, '') as model,
        COUNT(o.id) as countObservations,
        COUNT(DISTINCT o.trace_id) as countTraces,
        SUM(COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(o.usage_details, '$.input')) AS UNSIGNED), 0)) as inputUsage,
        SUM(COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(o.usage_details, '$.output')) AS UNSIGNED), 0)) as outputUsage,
        SUM(COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(o.usage_details, '$.total')) AS UNSIGNED), 0)) as totalUsage,
        SUM(COALESCE(o.total_cost, 0)) as totalCost
      FROM obs_dedup o
      WHERE o.rn = 1
      GROUP BY date, model
    ),
    daily_model_usage AS (
      SELECT
        mu.date,
        SUM(mu.countObservations) as countObservations,
        SUM(mu.totalCost) as totalCost,
        JSON_ARRAYAGG(JSON_ARRAY(mu.model, mu.inputUsage, mu.outputUsage, mu.totalUsage, mu.totalCost, mu.countObservations, mu.countTraces)) as daily_usage_tuple
      FROM model_usage mu
      GROUP BY mu.date
    ),
    trace_usage AS (
      SELECT
        DATE(t.timestamp) as date,
        COUNT(t.id) as countTraces
      FROM traces t
      WHERE t.project_id = {projectId: String}
      ${hasTracesFilter ? `AND ${appliedTracesFilter.query}` : ""}
      GROUP BY date
    ),
    all_dates AS (
      SELECT date FROM daily_model_usage
      UNION
      SELECT date FROM trace_usage
    )
    SELECT
      d.date,
      COALESCE(tu.countTraces, 0) as countTraces,
      COALESCE(dmu.countObservations, 0) as countObservations,
      COALESCE(dmu.totalCost, 0) as totalCost,
      dmu.daily_usage_tuple as usage
    FROM all_dates d
    LEFT JOIN daily_model_usage dmu ON d.date = dmu.date
    LEFT JOIN trace_usage tu ON d.date = tu.date
    ORDER BY d.date DESC
    ${props.limit !== undefined && props.page !== undefined ? `LIMIT {limit: Int32} OFFSET {offset: Int32}` : ""}
  `;

  const timestamp = props.fromTimestamp
    ? new Date(props.fromTimestamp)
    : timeFilter?.value;

  const adapter = DatabaseAdapterFactory.getInstance();
  return measureAndReturn({
    operationName: "generateDailyMetrics",
    projectId: props.projectId,
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
          ? { cteTimeFilter: convertDateToDateTime(timeFilter.value) }
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
    fn: async (input) => {
      const { query: obQuery, params: obParams } =
        convertFilterParamsToPositional(query, input.params);
      const result = await adapter.queryWithOptions<{
        date: string;
        countTraces: number | string;
        countObservations: number | string;
        totalCost: number | string;
        usage: string | null;
      }>({
        query: obQuery,
        params: obParams,
        tags: input.tags,
      });

      return result.map((record) => {
        let usage: Array<{
          model: string | null;
          inputUsage: number;
          outputUsage: number;
          totalUsage: number;
          totalCost: number;
          countObservations: number;
          countTraces: number;
        }> = [];
        if (record.usage) {
          try {
            const parsed = JSON.parse(record.usage as string) as (
              | string
              | number
            )[][];
            usage = (Array.isArray(parsed) ? parsed : []).map((u) => ({
              model: u[0] != null ? String(u[0]) : null,
              inputUsage: Number(u[1] ?? 0),
              outputUsage: Number(u[2] ?? 0),
              totalUsage: Number(u[3] ?? 0),
              totalCost: Number(u[4] ?? 0),
              countObservations: Number(u[5] ?? 0),
              countTraces: Number(u[6] ?? 0),
            }));
          } catch {
            usage = [];
          }
        }
        return {
          date: record.date,
          countTraces: Number(record.countTraces),
          countObservations: Number(record.countObservations),
          totalCost: Number(record.totalCost),
          usage,
        };
      });
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
    SELECT COUNT(DISTINCT DATE(t.timestamp)) as count
    FROM traces t
    WHERE t.project_id = {projectId: String}
    ${filter.length() > 0 ? `AND ${appliedFilter.query}` : ""}
  `;

  const timestamp = props.fromTimestamp
    ? new Date(props.fromTimestamp)
    : undefined;

  const adapter = DatabaseAdapterFactory.getInstance();
  return measureAndReturn({
    operationName: "getDailyMetricsCount",
    projectId: props.projectId,
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
    fn: async (input) => {
      const { query: obQuery, params: obParams } =
        convertFilterParamsToPositional(query, input.params);
      const records = await adapter.queryWithOptions<{
        count: string | number;
      }>({ query: obQuery, params: obParams, tags: input.tags });
      const val = records[0]?.count;
      return val != null ? Number(val) : undefined;
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
