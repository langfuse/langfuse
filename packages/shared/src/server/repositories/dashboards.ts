import { queryClickhouse } from "./clickhouse";
import { createFilterFromFilterState } from "../queries/clickhouse-sql/factory";
import { FilterState } from "../../types";
import {
  DateTimeFilter,
  FilterList,
} from "../queries/clickhouse-sql/clickhouse-filter";
import { dashboardColumnDefinitions } from "../../tableDefinitions/mapDashboards";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import {
  OBSERVATIONS_TO_TRACE_INTERVAL,
  SCORE_TO_TRACE_OBSERVATIONS_INTERVAL,
  TRACE_TO_OBSERVATIONS_INTERVAL,
} from "./constants";

export type DateTrunc = "year" | "month" | "week" | "day" | "hour" | "minute";

export const getTotalTraces = async (
  projectId: string,
  filter: FilterState,
) => {
  const chFilter = new FilterList(
    createFilterFromFilterState(filter, dashboardColumnDefinitions),
  ).apply();

  const query = `
    SELECT 
      count(id) as count 
    FROM traces t FINAL 
    WHERE project_id = {projectId: String}
    AND ${chFilter.query}`;

  const result = await queryClickhouse<{ count: number }>({
    query,
    params: {
      projectId,
      ...chFilter.params,
    },
  });

  if (result.length === 0) {
    return undefined;
  }

  return [{ countTraceId: result[0].count }];
};

export const getObservationsCostGroupedByName = async (
  projectId: string,
  filter: FilterState,
) => {
  const chFilter = new FilterList(
    createFilterFromFilterState(filter, dashboardColumnDefinitions),
  );

  const appliedFilter = chFilter.apply();

  const hasTraceFilter = chFilter.find((f) => f.clickhouseTable === "traces");

  const query = `
    SELECT 
      provided_model_name as name,
      sumMap(cost_details)['total'] as sum_cost_details,
      sumMap(usage_details)['total'] as sum_usage_details
    FROM observations o FINAL ${hasTraceFilter ? "LEFT JOIN traces t ON o.trace_id = t.id AND o.project_id = t.project_id" : ""}
    WHERE project_id = {projectId: String}
    AND ${appliedFilter.query}
    GROUP BY provided_model_name
    ORDER BY sumMap(cost_details)['total'] DESC
    `;

  const result = await queryClickhouse<{
    name: string;
    sum_cost_details: number;
    sum_usage_details: number;
  }>({
    query,
    params: {
      projectId,
      ...appliedFilter.params,
    },
  });

  return result;
};

export const getScoreAggregate = async (
  projectId: string,
  filter: FilterState,
) => {
  const chFilter = new FilterList(
    createFilterFromFilterState(filter, dashboardColumnDefinitions),
  );

  const timeFilter = chFilter.find(
    (f) =>
      f.field === "timestamp" && (f.operator === ">=" || f.operator === ">"),
  ) as DateTimeFilter | undefined;

  const chFilterApplied = chFilter.apply();

  const hasTraceFilter = chFilter.find((f) => f.clickhouseTable === "traces");

  const query = `
    SELECT 
      s.name,
      count(*) as count,
      avg(s.value) as avg_value,
      s.source,
      s.data_type
    FROM scores s FINAL 
     ${hasTraceFilter ? "JOIN traces t FINAL ON t.id = s.trace_id AND t.project_id = s.project_id" : ""}
    WHERE s.project_id = {projectId: String}
    AND ${chFilterApplied.query}
    ${timeFilter && hasTraceFilter ? `AND t.timestamp >= {tracesTimestamp: DateTime64(3)} - ${SCORE_TO_TRACE_OBSERVATIONS_INTERVAL}` : ""}
    GROUP BY s.name, s.source, s.data_type
    ORDER BY count(*) DESC
    `;

  const result = await queryClickhouse<{
    name: string;
    count: string;
    avg_value: string;
    source: string;
    data_type: string;
  }>({
    query,
    params: {
      projectId,
      ...chFilterApplied.params,
      ...(timeFilter
        ? { tracesTimestamp: convertDateToClickhouseDateTime(timeFilter.value) }
        : {}),
    },
  });

  return result;
};

export const groupTracesByTime = async (
  projectId: string,
  filter: FilterState,
  groupBy: DateTrunc,
) => {
  const chFilter = new FilterList(
    createFilterFromFilterState(filter, dashboardColumnDefinitions),
  ).apply();

  const query = `
    SELECT 
      ${selectTimeseriesColumn(groupBy, "timestamp", "timestamp")},
      count(*) as count
    FROM traces t FINAL
    WHERE project_id = {projectId: String}
    AND ${chFilter.query}
    GROUP BY timestamp
    ${orderByTimeSeries(groupBy, "timestamp")}
    `;

  const result = await queryClickhouse<{
    timestamp: string;
    count: string;
  }>({
    query,
    params: {
      projectId,
      ...chFilter.params,
    },
  });

  return result.map((row) => ({
    timestamp: new Date(row.timestamp),
    countTraceId: Number(row.count),
  }));
};

export const getObservationUsageByTime = async (
  projectId: string,
  filter: FilterState,
  groupBy: DateTrunc,
) => {
  const chFilter = new FilterList(
    createFilterFromFilterState(filter, dashboardColumnDefinitions),
  );

  const appliedFilter = chFilter.apply();

  const tracesFilter = chFilter.find((f) => f.clickhouseTable === "traces");
  const timeFilter = tracesFilter
    ? (chFilter.find(
        (f) =>
          f.clickhouseTable === "observations" &&
          f.field.includes("start_time") &&
          (f.operator === ">=" || f.operator === ">"),
      ) as DateTimeFilter | undefined)
    : undefined;

  const query = `
    SELECT 
      ${selectTimeseriesColumn(groupBy, "start_time", "start_time")},
      sumMap(usage_details)['total'] as sum_usage_details,
      sumMap(cost_details)['total'] as sum_cost_details,
      provided_model_name
    FROM observations o FINAL
    ${tracesFilter ? "LEFT JOIN traces t ON o.trace_id = t.id AND o.project_id = t.project_id" : ""}
    WHERE project_id = {projectId: String}
    AND ${appliedFilter.query}
    ${timeFilter ? `AND t.timestamp >= {traceTimestamp: DateTime64(3)} - ${OBSERVATIONS_TO_TRACE_INTERVAL}` : ""}
    GROUP BY start_time, provided_model_name
    ${orderByTimeSeries(groupBy, "start_time")}
    `;

  const result = await queryClickhouse<{
    start_time: string;
    sum_usage_details: string;
    sum_cost_details: number;
    provided_model_name: string;
  }>({
    query,
    params: {
      projectId,
      ...appliedFilter.params,
      ...(timeFilter
        ? { traceTimestamp: convertDateToClickhouseDateTime(timeFilter.value) }
        : {}),
    },
  });

  return result.map((row) => ({
    start_time: new Date(row.start_time),
    sum_usage_details: Number(row.sum_usage_details),
    sum_cost_details: row.sum_cost_details,
    provided_model_name: row.provided_model_name,
  }));
};

export const getDistinctModels = async (
  projectId: string,
  filter: FilterState,
) => {
  const chFilter = new FilterList(
    createFilterFromFilterState(filter, dashboardColumnDefinitions),
  );

  const appliedFilter = chFilter.apply();

  const tracesFilter = chFilter.find((f) => f.clickhouseTable === "traces");
  const timeFilter = tracesFilter
    ? (chFilter.find(
        (f) =>
          f.clickhouseTable === "observations" &&
          f.field.includes("start_time") &&
          (f.operator === ">=" || f.operator === ">"),
      ) as DateTimeFilter | undefined)
    : undefined;

  const query = `
    SELECT distinct(provided_model_name) as model
    FROM observations o
    ${tracesFilter ? "LEFT JOIN traces t ON o.trace_id = t.id AND o.project_id = t.project_id" : ""}
    WHERE project_id = {projectId: String}
    AND ${appliedFilter.query}
    ${timeFilter ? `AND t.timestamp >= {traceTimestamp: DateTime64(3)} - ${OBSERVATIONS_TO_TRACE_INTERVAL}` : ""}
    `;

  const result = await queryClickhouse<{ model: string }>({
    query,
    params: {
      projectId,
      ...appliedFilter.params,
      ...(timeFilter
        ? { traceTimestamp: convertDateToClickhouseDateTime(timeFilter.value) }
        : {}),
    },
  });

  return result;
};

export const getScoresAggregateOverTime = async (
  projectId: string,
  filter: FilterState,
  groupBy: DateTrunc,
) => {
  const chFilter = new FilterList(
    createFilterFromFilterState(filter, dashboardColumnDefinitions),
  );

  const appliedFilter = chFilter.apply();

  const traceFilter = chFilter.find((f) => f.clickhouseTable === "traces");

  const query = `
  SELECT 
    ${selectTimeseriesColumn(groupBy, "timestamp", "timestamp")},
    name,
    data_type,
    source,
    AVG(value) as avg_value
  FROM scores FINAL
  ${traceFilter ? "JOIN traces t ON scores.trace_id = t.id AND scores.project_id = t.project_id" : ""}
  WHERE project_id = {projectId: String}
  AND ${appliedFilter.query}
  AND data_type IN ('NUMERIC', 'BOOLEAN')
  GROUP BY 
    timestamp,
    name,
    data_type,
    source
  ${orderByTimeSeries(groupBy, "timestamp")};
`;

  const result = await queryClickhouse<{
    timestamp: string;
    name: string;
    data_type: string;
    source: string;
    avg_value: number;
  }>({
    query,
    params: {
      projectId,
      ...appliedFilter.params,
    },
  });

  return result.map((row) => ({
    scoreTimestamp: new Date(row.timestamp),
    scoreName: row.name,
    scoreDataType: row.data_type,
    scoreSource: row.source,
    avgValue: Number(row.avg_value),
  }));
};

export const getModelUsageByUser = async (
  projectId: string,
  filter: FilterState,
) => {
  const chFilter = new FilterList(
    createFilterFromFilterState(filter, dashboardColumnDefinitions),
  );

  const appliedFilter = chFilter.apply();

  const timeFilter = chFilter.find(
    (f) =>
      f.clickhouseTable === "observations" &&
      f.field.includes("start_time") &&
      (f.operator === ">=" || f.operator === ">"),
  ) as DateTimeFilter | undefined;

  const query = `
    SELECT 
      sumMap(usage_details)['total'] as sum_usage_details,
      sumMap(cost_details)['total'] as sum_cost_details,
      user_id
    FROM observations o FINAL
    JOIN traces t FINAL
    ON o.trace_id = t.id AND o.project_id = t.project_id
    WHERE project_id = {projectId: String}
    AND t.user_id IS NOT NULL
    AND ${appliedFilter.query}
    ${timeFilter ? `AND t.timestamp >= {traceTimestamp: DateTime64(3)} - ${OBSERVATIONS_TO_TRACE_INTERVAL}` : ""}
    GROUP BY user_id
    ORDER BY sum_cost_details DESC
    `;

  const result = await queryClickhouse<{
    sum_usage_details: string;
    sum_cost_details: number;
    user_id: string;
  }>({
    query,
    params: {
      projectId,
      ...appliedFilter.params,
      ...(timeFilter
        ? { traceTimestamp: convertDateToClickhouseDateTime(timeFilter.value) }
        : {}),
    },
  });

  return result.map((row) => ({
    sumUsageDetails: Number(row.sum_usage_details),
    sumCostDetails: Number(row.sum_cost_details),
    userId: row.user_id,
  }));
};

export const getObservationLatencies = async (
  projectId: string,
  filter: FilterState,
) => {
  const chFilter = new FilterList(
    createFilterFromFilterState(filter, dashboardColumnDefinitions),
  );

  const appliedFilter = chFilter.apply();

  const query = `
    SELECT
      quantilesExactLow(0.5, 0.9, 0.95, 0.99)(date_diff('milliseconds', o.start_time, o.end_time)) as quantiles,
      name
    FROM observations o FINAL
    ${chFilter.find((f) => f.clickhouseTable === "traces") ? "LEFT JOIN traces t ON o.trace_id = t.id AND o.project_id = t.project_id" : ""}
    WHERE project_id = {projectId: String}
    AND ${appliedFilter.query}
    GROUP BY name
    ORDER BY quantiles[2] DESC
    `;

  const result = await queryClickhouse<{ quantiles: string[]; name: string }>({
    query,
    params: { projectId, ...appliedFilter.params },
  });

  return result.map((row) => ({
    p50: Number(row.quantiles[0]) / 1000,
    p90: Number(row.quantiles[1]) / 1000,
    p95: Number(row.quantiles[2]) / 1000,
    p99: Number(row.quantiles[3]) / 1000,
    name: row.name,
  }));
};

export const getTracesLatencies = async (
  projectId: string,
  filter: FilterState,
) => {
  const chFilter = new FilterList(
    createFilterFromFilterState(filter, dashboardColumnDefinitions),
  );

  const appliedFilter = chFilter.apply();

  const timestampFilter = chFilter.find(
    (f) =>
      f.clickhouseTable === "traces" &&
      f.field === 't."timestamp"' &&
      (f.operator === ">=" || f.operator === ">"),
  ) as DateTimeFilter | undefined;

  const query = `
    WITH trace_latencies as (
      select o.trace_id,
             t.name,
             o.project_id,
             date_diff('milliseconds', min(o.start_time), coalesce(max(o.end_time), max(o.start_time))) as duration
      FROM traces t FINAL 
      JOIN observations o FINAL
      ON o.trace_id = t.id AND o.project_id = t.project_id
      WHERE project_id = {projectId: String}
      AND ${appliedFilter.query}
      ${timestampFilter ? `AND o.start_time > {dateTimeFilterObservations: DateTime64(3)} - ${TRACE_TO_OBSERVATIONS_INTERVAL}` : ""}
      GROUP BY o.project_id, o.trace_id, t.name
    )

    SELECT
      quantilesExactLow(0.5, 0.9, 0.95, 0.99)(duration) as quantiles,
      name
    FROM trace_latencies
    GROUP BY name
    ORDER BY quantiles[2] DESC
  `;

  const result = await queryClickhouse<{ quantiles: string[]; name: string }>({
    query,
    params: {
      projectId,
      ...appliedFilter.params,
      ...(timestampFilter
        ? { dateTimeFilterObservations: timestampFilter.value }
        : {}),
    },
  });

  return result.map((row) => ({
    p50: Number(row.quantiles[0]) / 1000,
    p90: Number(row.quantiles[1]) / 1000,
    p95: Number(row.quantiles[2]) / 1000,
    p99: Number(row.quantiles[3]) / 1000,
    name: row.name,
  }));
};

export const getModelLatenciesOverTime = async (
  projectId: string,
  filter: FilterState,
  groupBy: DateTrunc,
) => {
  const chFilter = new FilterList(
    createFilterFromFilterState(filter, dashboardColumnDefinitions),
  );

  const appliedFilter = chFilter.apply();

  const traceFilter = chFilter.find((f) => f.clickhouseTable === "traces");

  const query = `
  SELECT 
    ${selectTimeseriesColumn(groupBy, "o.start_time", "start_time_bucket")},
    provided_model_name,
    quantilesExactLow(0.5, 0.75, 0.9, 0.95, 0.99)(date_diff('milliseconds', o.start_time, o.end_time)) as quantiles
  FROM observations o FINAL
  ${traceFilter ? "JOIN traces t ON o.trace_id = t.id AND o.project_id = t.project_id" : ""}
  WHERE project_id = {projectId: String}
  AND ${appliedFilter.query}
  GROUP BY provided_model_name, start_time_bucket
  ${orderByTimeSeries(groupBy, "start_time_bucket")};
`;

  const result = await queryClickhouse<{
    start_time_bucket: string;
    provided_model_name: string;
    quantiles: string[];
  }>({ query, params: { projectId, ...appliedFilter.params } });

  return result.map((row) => ({
    p50: Number(row.quantiles[0]) / 1000,
    p75: Number(row.quantiles[1]) / 1000,
    p90: Number(row.quantiles[2]) / 1000,
    p95: Number(row.quantiles[3]) / 1000,
    p99: Number(row.quantiles[4]) / 1000,
    model: row.provided_model_name,
    start_time: new Date(row.start_time_bucket),
  }));
};

export const getNumericScoreTimeSeries = async (
  projectId: string,
  filter: FilterState,
  groupBy: DateTrunc,
) => {
  const chFilter = new FilterList(
    createFilterFromFilterState(filter, dashboardColumnDefinitions),
  );
  const chFilterRes = chFilter.apply();

  const traceFilter = chFilter.find((f) => f.clickhouseTable === "traces");

  const query = `
    SELECT
    ${selectTimeseriesColumn(groupBy, "s.timestamp", "score_timestamp")},
    s.name as score_name,
    AVG(s.value) as avg_value
    FROM scores s final
    ${traceFilter ? "JOIN traces t ON s.trace_id = t.id AND s.project_id = t.project_id" : ""}
    WHERE s.project_id = {projectId: String}
    ${chFilterRes?.query ? `AND ${chFilterRes.query}` : ""}
    GROUP BY score_name, score_timestamp
    ${orderByTimeSeries(groupBy, "score_timestamp")}
  `;

  return queryClickhouse<{
    score_timestamp: Date;
    score_name: string;
    avg_value: number;
  }>({
    query,
    params: {
      projectId,
      ...(chFilterRes ? chFilterRes.params : {}),
    },
  });
};

export const getCategoricalScoreTimeSeries = async (
  projectId: string,
  filter: FilterState,
  groupBy: DateTrunc | undefined,
) => {
  const chFilter = new FilterList(
    createFilterFromFilterState(filter, dashboardColumnDefinitions),
  );
  const chFilterRes = chFilter.apply();

  const traceFilter = chFilter.find((f) => f.clickhouseTable === "traces");

  const query = `
    SELECT
    ${groupBy ? selectTimeseriesColumn(groupBy, "s.timestamp", "score_timestamp") + ", " : ""}
    s.name as score_name,
    s.data_type as score_data_type,
    s.source as score_source,
    s.string_value as score_value,
    count(s.string_value) as count
    FROM scores s final
    ${traceFilter ? "JOIN traces t ON s.trace_id = t.id AND s.project_id = t.project_id" : ""}
    WHERE s.project_id = {projectId: String}
    ${chFilterRes?.query ? `AND ${chFilterRes.query}` : ""}
    GROUP BY score_name, score_data_type, score_source, score_value ${groupBy ? ", score_timestamp" : ""}
    ${groupBy ? orderByTimeSeries(groupBy, "score_timestamp") : ""}
  `;

  return queryClickhouse<{
    score_timestamp?: Date;
    score_name: string;
    score_data_type: string;
    score_source: string;
    score_value: string;
    count: number;
  }>({
    query,
    params: {
      projectId,
      ...(chFilterRes ? chFilterRes.params : {}),
    },
  });
};

const orderByTimeSeries = (dateTrunc: DateTrunc, col: string) => {
  let interval;
  switch (dateTrunc) {
    case "year":
      interval = "toIntervalYear(1)";
      break;
    case "month":
      interval = "toIntervalMonth(1)";
      break;
    case "week":
      interval = "toIntervalWeek(1)";
      break;
    case "day":
      interval = "toIntervalDay(1)";
      break;
    case "hour":
      interval = "toIntervalHour(1)";
      break;
    case "minute":
      interval = "toIntervalMinute(1)";
      break;
    default:
      return undefined;
  }

  return `ORDER BY ${col} ASC WITH FILL STEP ${interval}`;
};

const selectTimeseriesColumn = (
  dateTrunc: DateTrunc,
  col: string,
  as: String,
) => {
  let interval;
  switch (dateTrunc) {
    case "year":
      interval = "toStartOfYear";
      break;
    case "month":
      interval = "toStartOfMonth";
      break;
    case "week":
      interval = "toStartOfWeek";
      break;
    case "day":
      interval = "toStartOfDay";
      break;
    case "hour":
      interval = "toStartOfHour";
      break;
    case "minute":
      interval = "toStartOfMinute";
      break;
    default:
      return undefined;
  }
  return `${interval}(${col}) as ${as}`;
};
