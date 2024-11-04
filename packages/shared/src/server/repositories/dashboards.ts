import { queryClickhouse } from "./clickhouse";
import { createFilterFromFilterState } from "../queries/clickhouse-filter/factory";
import { FilterState } from "../../types";
import { FilterList } from "../queries/clickhouse-filter/clickhouse-filter";
import { dashboardColumnDefinitions } from "../../tableDefinitions/mapDashboards";
import { group } from "console";

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
  ).apply();

  const query = `
    SELECT 
      s.name,
      count(*) as count,
      avg(s.value) as avg_value,
      s.source,
      s.data_type
    FROM scores s FINAL JOIN traces t FINAL ON t.id = s.trace_id AND t.project_id = s.project_id
    WHERE s.project_id = {projectId: String}
    AND ${chFilter.query}
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
      ...chFilter.params,
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

  const query = `
    SELECT 
      ${selectTimeseriesColumn(groupBy, "start_time", "start_time")},
      sumMap(usage_details)['total'] as sum_usage_details,
      sumMap(cost_details)['total'] as sum_cost_details,
      provided_model_name
    FROM observations o FINAL
    ${chFilter.find((f) => f.clickhouseTable === "traces") ? "LEFT JOIN traces t ON o.trace_id = t.id AND o.project_id = t.project_id" : ""}
    WHERE project_id = {projectId: String}
    AND ${appliedFilter.query}
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
    },
  });

  return result.map((row) => ({
    start_time: new Date(row.start_time),
    sum_usage_details: Number(row.sum_usage_details),
    sum_cost_details: row.sum_cost_details,
    provided_model_name: row.provided_model_name,
  }));
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
      interval = "toMinute";
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
