import { type DateTimeFilter, FilterList } from "../queries";
import { queryClickhouse } from "./clickhouse";
import { TRACE_TO_OBSERVATIONS_INTERVAL } from "./constants";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import { measureAndReturn } from "../clickhouse/measureAndReturn";

export const generateDailyMetrics = async ({
  projectId,
  filter,
  pagination,
}: {
  projectId: string;
  filter: FilterList;
  pagination?: { limit: number; page: number };
}) => {
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

  const query = `
    WITH model_usage AS (
      SELECT
        toDate(o.start_time) as date,
        o.provided_model_name as model,
        count(o.id) as countObservations,
        count(distinct o.trace_id) as countTraces,
        sum(arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'input') > 0, o.usage_details)))) as inputUsage,
        sum(arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, o.usage_details)))) as outputUsage,
        sumMap(o.usage_details)['total'] as totalUsage,
        sum(coalesce(o.total_cost, 0)) as totalCost
      FROM observations o FINAL ${hasNonTimestampsFilter ? " LEFT JOIN __TRACE_TABLE__ t FINAL on o.trace_id = t.id AND o.project_id = t.project_id" : ""}
      WHERE o.project_id = {projectId: String}
      ${hasNonTimestampsFilter ? `AND t.project_id = {projectId: String} AND ${appliedFilter.query}` : ""}
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
    ${pagination !== undefined ? `LIMIT {limit: Int32} OFFSET {offset: Int32}` : ""}
  `;

  const timestamp = timeFilter?.value;

  return measureAndReturn({
    operationName: "generateDailyMetrics",
    projectId,
    input: {
      params: {
        ...appliedTracesFilter.params,
        ...appliedFilter.params,
        projectId,
        ...(pagination !== undefined
          ? {
              limit: pagination.limit,
              offset: (pagination.page - 1) * pagination.limit,
            }
          : {}),
        ...(timeFilter
          ? {
              cteTimeFilter: convertDateToClickhouseDateTime(timeFilter.value),
            }
          : {}),
      },
      tags: { projectId },
      timestamp,
    },
    fn: async (input: {
      params: Record<string, unknown>;
      tags: Record<string, string>;
      timestamp?: Date;
    }) => {
      const result = await queryClickhouse<{
        date: string;
        countTraces: number;
        countObservations: number;
        totalCost: number;
        usage: (string | null)[][];
      }>({
        query: query.replaceAll("__TRACE_TABLE__", "traces"),
        params: input.params,
        tags: input.tags,
        clickhouseConfigs: {
          request_timeout: 60_000,
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

export const getDailyMetricsCount = async ({
  projectId,
  filter,
}: {
  projectId: string;
  filter: FilterList;
}) => {
  const tracesFilter = filter.filter((f) => f.clickhouseTable === "traces");
  const appliedFilter = tracesFilter.apply();

  const timeFilter = filter.find(
    (f) =>
      f.clickhouseTable === "traces" &&
      f.field.includes("timestamp") &&
      (f.operator === ">=" || f.operator === ">"),
  ) as DateTimeFilter | undefined;
  const timestamp = timeFilter?.value;

  const query = `
    SELECT count(distinct toDate(timestamp)) as count
    FROM __TRACE_TABLE__ t
    WHERE project_id = {projectId: String}
    ${filter.length() > 0 ? `AND ${appliedFilter.query}` : ""}
  `;

  return measureAndReturn({
    operationName: "getDailyMetricsCount",
    projectId,
    input: {
      params: { ...appliedFilter.params, projectId },
      tags: { projectId },
      timestamp,
    },
    fn: async (input: {
      params: Record<string, unknown>;
      tags: Record<string, string>;
      timestamp?: Date;
    }) => {
      const records = await queryClickhouse<{ count: string }>({
        query: query.replace("__TRACE_TABLE__", "traces"),
        params: input.params,
        tags: input.tags,
      });
      return records.map((record) => Number(record.count)).shift();
    },
  });
};
