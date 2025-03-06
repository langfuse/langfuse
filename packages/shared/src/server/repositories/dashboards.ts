import {
  parseClickhouseUTCDateTimeFormat,
  queryClickhouse,
} from "./clickhouse";
import { createFilterFromFilterState } from "../queries/clickhouse-sql/factory";
import { FilterState } from "../../types";
import { DateTimeFilter, FilterList } from "../queries";
import { dashboardColumnDefinitions } from "../../tableDefinitions";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import {
  OBSERVATIONS_TO_TRACE_INTERVAL,
  SCORE_TO_TRACE_OBSERVATIONS_INTERVAL,
  TRACE_TO_OBSERVATIONS_INTERVAL,
} from "./constants";

export type DateTrunc = "year" | "month" | "week" | "day" | "hour" | "minute";

const extractEnvironmentFilterFromFilters = (
  filter: FilterState,
): { envFilter: FilterState; remainingFilters: FilterState } => {
  return {
    envFilter: filter.filter((f) => f.column === "environment"),
    remainingFilters: filter.filter((f) => f.column !== "environment"),
  };
};

const convertEnvFilterToClickhouseFilter = (filter: FilterState) => {
  return createFilterFromFilterState(filter, [
    {
      clickhouseSelect: "environment",
      clickhouseTableName: "traces",
      uiTableId: "environment",
      uiTableName: "Environment",
    },
  ]);
};

export const getTotalTraces = async (
  projectId: string,
  filter: FilterState,
) => {
  const { envFilter, remainingFilters } =
    extractEnvironmentFilterFromFilters(filter);
  const environmentFilter = new FilterList(
    convertEnvFilterToClickhouseFilter(envFilter),
  ).apply();
  const chFilter = new FilterList(
    createFilterFromFilterState(remainingFilters, dashboardColumnDefinitions),
  ).apply();

  const query = `
    SELECT 
      count(id) as count 
    FROM traces t FINAL 
    WHERE project_id = {projectId: String}
    AND ${chFilter.query}
    ${environmentFilter.query ? `AND ${environmentFilter.query}` : ""}
  `;

  const result = await queryClickhouse<{ count: number }>({
    query,
    params: {
      projectId,
      ...chFilter.params,
      ...environmentFilter.params,
    },
    tags: {
      feature: "dashboard",
      type: "totalTraces",
      kind: "analytic",
      projectId,
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
  const { envFilter, remainingFilters } =
    extractEnvironmentFilterFromFilters(filter);
  const environmentFilter = new FilterList(
    convertEnvFilterToClickhouseFilter(envFilter),
  ).apply();
  const chFilter = new FilterList(
    createFilterFromFilterState(remainingFilters, dashboardColumnDefinitions),
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
    ${appliedFilter.query ? `AND ${appliedFilter.query}` : ""}
    ${environmentFilter.query ? `AND ${environmentFilter.query}` : ""}
    GROUP BY provided_model_name
    ORDER BY sumMap(cost_details)['total'] DESC
    LIMIT 50
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
      ...environmentFilter.params,
    },
    tags: {
      feature: "dashboard",
      type: "observationCostGroupedByName",
      kind: "analytic",
      projectId,
    },
  });

  return result;
};

export const getScoreAggregate = async (
  projectId: string,
  filter: FilterState,
) => {
  const { envFilter, remainingFilters } =
    extractEnvironmentFilterFromFilters(filter);
  const environmentFilter = new FilterList(
    convertEnvFilterToClickhouseFilter(envFilter),
  ).apply();
  const chFilter = new FilterList(
    createFilterFromFilterState(remainingFilters, dashboardColumnDefinitions),
  );

  const timeFilter = chFilter.find(
    (f) =>
      f.field === "timestamp" && (f.operator === ">=" || f.operator === ">"),
  ) as DateTimeFilter | undefined;

  const chFilterApplied = chFilter.apply();

  const hasTraceFilter = chFilter.find((f) => f.clickhouseTable === "traces");
  // TODO: Validate whether we can filter traces on timestamp here.

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
    ${environmentFilter.query ? `AND ${environmentFilter.query}` : ""}
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
      ...environmentFilter.params,
      ...(timeFilter
        ? { tracesTimestamp: convertDateToClickhouseDateTime(timeFilter.value) }
        : {}),
    },
    tags: {
      feature: "dashboard",
      type: "scoreAggregate",
      kind: "analytic",
      projectId,
    },
  });

  return result;
};

export const groupTracesByTime = async (
  projectId: string,
  filter: FilterState,
) => {
  const { envFilter, remainingFilters } =
    extractEnvironmentFilterFromFilters(filter);
  const environmentFilter = new FilterList(
    convertEnvFilterToClickhouseFilter(envFilter),
  ).apply();
  const chFilter = new FilterList(
    createFilterFromFilterState(remainingFilters, dashboardColumnDefinitions),
  ).apply();

  const [orderByQuery, orderByParams, bucketSizeInSeconds] = orderByTimeSeries(
    filter,
    "timestamp",
  );

  const query = `
    SELECT 
      ${selectTimeseriesColumn(bucketSizeInSeconds, "timestamp", "timestamp")},
      count(*) as count
    FROM traces t FINAL
    WHERE project_id = {projectId: String}
    AND ${chFilter.query}
    ${environmentFilter.query ? `AND ${environmentFilter.query}` : ""}
    GROUP BY timestamp
    ${orderByQuery}
    `;
  const result = await queryClickhouse<{
    timestamp: string;
    count: string;
  }>({
    query,
    params: {
      projectId,
      ...chFilter.params,
      ...environmentFilter.params,
      ...orderByParams,
    },
    tags: {
      feature: "dashboard",
      type: "tracesByTime",
      kind: "analytic",
      projectId,
    },
  });

  return result.map((row) => ({
    timestamp: parseClickhouseUTCDateTimeFormat(row.timestamp),
    countTraceId: Number(row.count),
  }));
};

export const getObservationUsageByTime = async (
  projectId: string,
  filter: FilterState,
) => {
  const { envFilter, remainingFilters } =
    extractEnvironmentFilterFromFilters(filter);
  const environmentFilter = new FilterList(
    convertEnvFilterToClickhouseFilter(envFilter),
  ).apply();
  const chFilter = new FilterList(
    createFilterFromFilterState(remainingFilters, dashboardColumnDefinitions),
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

  const [orderByQuery, orderByParams, bucketSizeInSeconds] = orderByTimeSeries(
    filter,
    "start_time",
  );

  const query = `
    SELECT 
      ${selectTimeseriesColumn(bucketSizeInSeconds, "start_time", "start_time")},
      sumMap(usage_details) as units,
      sumMap(cost_details) as cost, 
      provided_model_name
    FROM observations o FINAL
    ${tracesFilter ? "LEFT JOIN traces t ON o.trace_id = t.id AND o.project_id = t.project_id" : ""}
    WHERE project_id = {projectId: String}
    AND ${appliedFilter.query}
    ${environmentFilter.query ? `AND ${environmentFilter.query}` : ""}
    ${timeFilter ? `AND t.timestamp >= {traceTimestamp: DateTime64(3)} - ${OBSERVATIONS_TO_TRACE_INTERVAL}` : ""}
    GROUP BY start_time, provided_model_name
    ${orderByQuery}
    `;

  const result = await queryClickhouse<{
    start_time: string;
    units: Record<string, number>;
    cost: Record<string, number>;
    provided_model_name: string;
  }>({
    query,
    params: {
      projectId,
      ...appliedFilter.params,
      ...environmentFilter.params,
      ...orderByParams,
      ...(timeFilter
        ? { traceTimestamp: convertDateToClickhouseDateTime(timeFilter.value) }
        : {}),
    },
    tags: {
      feature: "dashboard",
      type: "observationUsageByTime",
      kind: "analytic",
      projectId,
    },
  });

  return result.map((row) => ({
    start_time: parseClickhouseUTCDateTimeFormat(row.start_time),
    units: Object.fromEntries(
      Object.entries(row.units ?? {}).map(([key, value]) => [
        key,
        Number(value),
      ]),
    ),
    cost: Object.fromEntries(
      Object.entries(row.cost ?? {}).map(([key, value]) => [
        key,
        Number(value),
      ]),
    ),
    provided_model_name: row.provided_model_name,
  }));
};

export const getDistinctModels = async (
  projectId: string,
  filter: FilterState,
) => {
  const { envFilter, remainingFilters } =
    extractEnvironmentFilterFromFilters(filter);
  const environmentFilter = new FilterList(
    convertEnvFilterToClickhouseFilter(envFilter),
  ).apply();
  const chFilter = new FilterList(
    createFilterFromFilterState(remainingFilters, dashboardColumnDefinitions),
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

  // No need for final as duplicates are caught by distinct anyway.
  const query = `
    SELECT distinct(provided_model_name) as model, count(*) as count
    FROM observations o
    ${tracesFilter ? "LEFT JOIN traces t ON o.trace_id = t.id AND o.project_id = t.project_id" : ""}
    WHERE project_id = {projectId: String}
    AND ${appliedFilter.query}
    ${environmentFilter.query ? `AND ${environmentFilter.query}` : ""}
    ${timeFilter ? `AND t.timestamp >= {traceTimestamp: DateTime64(3)} - ${OBSERVATIONS_TO_TRACE_INTERVAL}` : ""}
    GROUP BY provided_model_name
    ORDER BY count(*) DESC
    LIMIT 1000
    `;

  const result = await queryClickhouse<{ model: string }>({
    query,
    params: {
      projectId,
      ...appliedFilter.params,
      ...environmentFilter.params,
      ...(timeFilter
        ? { traceTimestamp: convertDateToClickhouseDateTime(timeFilter.value) }
        : {}),
    },
    tags: {
      feature: "dashboard",
      type: "distinctModels",
      kind: "analytic",
      projectId,
    },
  });

  return result;
};

export const getScoresAggregateOverTime = async (
  projectId: string,
  filter: FilterState,
) => {
  const { envFilter, remainingFilters } =
    extractEnvironmentFilterFromFilters(filter);
  const environmentFilter = new FilterList(
    convertEnvFilterToClickhouseFilter(envFilter),
  ).apply();
  const chFilter = new FilterList(
    createFilterFromFilterState(remainingFilters, dashboardColumnDefinitions),
  );

  const appliedFilter = chFilter.apply();

  const traceFilter = chFilter.find((f) => f.clickhouseTable === "traces");
  // TODO: Validate whether we can filter traces on timestamp here.

  const [orderByQuery, orderByParams, bucketSizeInSeconds] = orderByTimeSeries(
    filter,
    "timestamp",
  );

  const query = `
  SELECT 
    ${selectTimeseriesColumn(bucketSizeInSeconds, "timestamp", "timestamp")},
    name,
    data_type,
    source,
    AVG(value) as avg_value
  FROM scores FINAL
  ${traceFilter ? "JOIN traces t ON scores.trace_id = t.id AND scores.project_id = t.project_id" : ""}
  WHERE project_id = {projectId: String}
  ${environmentFilter.query ? `AND ${environmentFilter.query}` : ""}
  AND ${appliedFilter.query}
  AND data_type IN ('NUMERIC', 'BOOLEAN')
  GROUP BY 
    timestamp,
    name,
    data_type,
    source
  ${orderByQuery};
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
      ...environmentFilter.params,
      ...orderByParams,
    },
    tags: {
      feature: "dashboard",
      type: "scoresAggregateOverTime",
      kind: "analytic",
      projectId,
    },
  });

  return result.map((row) => ({
    scoreTimestamp: parseClickhouseUTCDateTimeFormat(row.timestamp),
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
  const { envFilter, remainingFilters } =
    extractEnvironmentFilterFromFilters(filter);
  const environmentFilter = new FilterList(
    convertEnvFilterToClickhouseFilter(envFilter),
  ).apply();
  const chFilter = new FilterList(
    createFilterFromFilterState(remainingFilters, dashboardColumnDefinitions),
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
    ${environmentFilter.query ? `AND ${environmentFilter.query}` : ""}
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
      ...environmentFilter.params,
      ...(timeFilter
        ? { traceTimestamp: convertDateToClickhouseDateTime(timeFilter.value) }
        : {}),
    },
    tags: {
      feature: "dashboard",
      type: "modelUsageByUser",
      kind: "analytic",
      projectId,
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
  const { envFilter, remainingFilters } =
    extractEnvironmentFilterFromFilters(filter);
  const environmentFilter = new FilterList(
    convertEnvFilterToClickhouseFilter(envFilter),
  ).apply();
  const chFilter = new FilterList(
    createFilterFromFilterState(remainingFilters, dashboardColumnDefinitions),
  );

  const appliedFilter = chFilter.apply();

  // Skipping FINAL here, as the quantiles are approximate to begin with.
  const query = `
    SELECT
      quantiles(0.5, 0.9, 0.95, 0.99)(date_diff('millisecond', o.start_time, o.end_time)) as quantiles,
      name
    FROM observations o
    ${chFilter.find((f) => f.clickhouseTable === "traces") ? "LEFT JOIN traces t ON o.trace_id = t.id AND o.project_id = t.project_id" : ""}
    WHERE project_id = {projectId: String}
    AND ${appliedFilter.query}
    ${environmentFilter.query ? `AND ${environmentFilter.query}` : ""}
    GROUP BY name
    ORDER BY quantiles[2] DESC
    `;

  const result = await queryClickhouse<{ quantiles: string[]; name: string }>({
    query,
    params: {
      projectId,
      ...appliedFilter.params,
      ...environmentFilter.params,
    },
    tags: {
      feature: "dashboard",
      type: "observationLatencies",
      kind: "analytic",
      projectId,
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

export const getTracesLatencies = async (
  projectId: string,
  filter: FilterState,
) => {
  const { envFilter, remainingFilters } =
    extractEnvironmentFilterFromFilters(filter);
  const environmentFilter = new FilterList(
    convertEnvFilterToClickhouseFilter(envFilter),
  ).apply();
  const chFilter = new FilterList(
    createFilterFromFilterState(remainingFilters, dashboardColumnDefinitions),
  );

  const appliedFilter = chFilter.apply();

  const timestampFilter = chFilter.find(
    (f) =>
      f.clickhouseTable === "traces" &&
      f.field === 't."timestamp"' &&
      (f.operator === ">=" || f.operator === ">"),
  ) as DateTimeFilter | undefined;

  // Skipping FINAL here, as the quantiles are approximate to begin with.
  const query = `
    WITH trace_latencies as (
      select o.trace_id,
             t.name,
             o.project_id,
             date_diff('millisecond', min(o.start_time), coalesce(max(o.end_time), max(o.start_time))) as duration
      FROM traces t 
      JOIN observations o
      ON o.trace_id = t.id AND o.project_id = t.project_id
      WHERE project_id = {projectId: String}
      AND ${appliedFilter.query}
      ${environmentFilter.query ? `AND ${environmentFilter.query}` : ""}
      ${timestampFilter ? `AND o.start_time > {dateTimeFilterObservations: DateTime64(3)} - ${TRACE_TO_OBSERVATIONS_INTERVAL}` : ""}
      GROUP BY o.project_id, o.trace_id, t.name
    )

    SELECT
      quantiles(0.5, 0.9, 0.95, 0.99)(duration) as quantiles,
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
      ...environmentFilter.params,
      ...(timestampFilter
        ? { dateTimeFilterObservations: timestampFilter.value }
        : {}),
    },
    tags: {
      feature: "dashboard",
      type: "tracesLatencies",
      kind: "analytic",
      projectId,
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
) => {
  const { envFilter, remainingFilters } =
    extractEnvironmentFilterFromFilters(filter);
  const environmentFilter = new FilterList(
    convertEnvFilterToClickhouseFilter(envFilter),
  ).apply();
  const chFilter = new FilterList(
    createFilterFromFilterState(remainingFilters, dashboardColumnDefinitions),
  );

  const appliedFilter = chFilter.apply();

  const traceFilter = chFilter.find((f) => f.clickhouseTable === "traces");

  const [orderByQuery, orderByParams, bucketSizeInSeconds] = orderByTimeSeries(
    filter,
    "start_time_bucket",
  );

  // Skipping FINAL here, as the quantiles are approximate to begin with.
  const query = `
  SELECT 
    ${selectTimeseriesColumn(bucketSizeInSeconds, "o.start_time", "start_time_bucket")},
    provided_model_name,
    quantiles(0.5, 0.75, 0.9, 0.95, 0.99)(date_diff('millisecond', o.start_time, o.end_time)) as quantiles
  FROM observations o
  ${traceFilter ? "JOIN traces t ON o.trace_id = t.id AND o.project_id = t.project_id" : ""}
  WHERE project_id = {projectId: String}
  ${environmentFilter.query ? `AND ${environmentFilter.query}` : ""}
  AND ${appliedFilter.query}
  GROUP BY provided_model_name, start_time_bucket
  ${orderByQuery};
`;

  const result = await queryClickhouse<{
    start_time_bucket: string;
    provided_model_name: string;
    quantiles: string[];
  }>({
    query,
    params: {
      projectId,
      ...appliedFilter.params,
      ...environmentFilter.params,
      ...orderByParams,
    },
    tags: {
      feature: "dashboard",
      type: "modelLatenciesOverTime",
      kind: "analytic",
      projectId,
    },
  });

  return result.map((row) => ({
    p50: Number(row.quantiles[0]) / 1000,
    p75: Number(row.quantiles[1]) / 1000,
    p90: Number(row.quantiles[2]) / 1000,
    p95: Number(row.quantiles[3]) / 1000,
    p99: Number(row.quantiles[4]) / 1000,
    model: row.provided_model_name,
    start_time: parseClickhouseUTCDateTimeFormat(row.start_time_bucket),
  }));
};

export const getNumericScoreTimeSeries = async (
  projectId: string,
  filter: FilterState,
) => {
  const { envFilter, remainingFilters } =
    extractEnvironmentFilterFromFilters(filter);
  const environmentFilter = new FilterList(
    convertEnvFilterToClickhouseFilter(envFilter),
  ).apply();
  const chFilter = new FilterList(
    createFilterFromFilterState(remainingFilters, dashboardColumnDefinitions),
  );
  const chFilterRes = chFilter.apply();

  const traceFilter = chFilter.find((f) => f.clickhouseTable === "traces");

  const [orderByQuery, orderByParams, bucketSizeInSeconds] = orderByTimeSeries(
    filter,
    "score_timestamp",
  );

  const query = `
    SELECT
    ${selectTimeseriesColumn(bucketSizeInSeconds, "s.timestamp", "score_timestamp")},
    s.name as score_name,
    AVG(s.value) as avg_value
    FROM scores s final
    ${traceFilter ? "JOIN traces t ON s.trace_id = t.id AND s.project_id = t.project_id" : ""}
    WHERE s.project_id = {projectId: String}
    ${environmentFilter.query ? `AND ${environmentFilter.query}` : ""}
    ${chFilterRes?.query ? `AND ${chFilterRes.query}` : ""}
    GROUP BY score_name, score_timestamp
    ${orderByQuery}
  `;

  const result = await queryClickhouse<{
    score_timestamp: string;
    score_name: string;
    avg_value: number;
  }>({
    query,
    params: {
      projectId,
      ...(chFilterRes ? chFilterRes.params : {}),
      ...environmentFilter.params,
      ...orderByParams,
    },
    tags: {
      feature: "dashboard",
      type: "numericScoreTimeSeries",
      kind: "analytic",
      projectId,
    },
  });

  return result.map((row) => ({
    scoreTimestamp: parseClickhouseUTCDateTimeFormat(row.score_timestamp),
    scoreName: row.score_name,
    avgValue: Number(row.avg_value),
  }));
};

export const getCategoricalScoreTimeSeries = async (
  projectId: string,
  filter: FilterState,
) => {
  const { envFilter, remainingFilters } =
    extractEnvironmentFilterFromFilters(filter);
  const environmentFilter = new FilterList(
    convertEnvFilterToClickhouseFilter(envFilter),
  ).apply();
  const chFilter = new FilterList(
    createFilterFromFilterState(remainingFilters, dashboardColumnDefinitions),
  );
  const chFilterRes = chFilter.apply();

  const traceFilter = chFilter.find((f) => f.clickhouseTable === "traces");

  const [orderByQuery, orderByParams, bucketSizeInSeconds] = orderByTimeSeries(
    filter,
    "score_timestamp",
  );

  const query = `
    SELECT
    ${bucketSizeInSeconds ? selectTimeseriesColumn(bucketSizeInSeconds, "s.timestamp", "score_timestamp") + ", " : ""}
    s.name as score_name,
    s.data_type as score_data_type,
    s.source as score_source,
    s.string_value as score_value,
    count(s.string_value) as count
    FROM scores s final
    ${traceFilter ? "JOIN traces t ON s.trace_id = t.id AND s.project_id = t.project_id" : ""}
    WHERE s.project_id = {projectId: String}
    ${environmentFilter.query ? `AND ${environmentFilter.query}` : ""}
    ${chFilterRes?.query ? `AND ${chFilterRes.query}` : ""}
    GROUP BY score_name, score_data_type, score_source, score_value ${bucketSizeInSeconds ? ", score_timestamp" : ""}
      ${orderByQuery}
  `;

  const result = await queryClickhouse<{
    score_timestamp?: string;
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
      ...environmentFilter.params,
      ...orderByParams,
    },
    tags: {
      feature: "dashboard",
      type: "categoricalScoreTimeSeries",
      kind: "analytic",
      projectId,
    },
  });

  return result.map((row) => ({
    scoreTimestamp: row.score_timestamp
      ? parseClickhouseUTCDateTimeFormat(row.score_timestamp)
      : undefined,
    scoreName: row.score_name,
    scoreDataType: row.score_data_type,
    scoreSource: row.score_source,
    scoreValue: row.score_value,
    count: Number(row.count),
  }));
};

export const getObservationsStatusTimeSeries = async (
  projectId: string,
  filter: FilterState,
) => {
  const { envFilter, remainingFilters } =
    extractEnvironmentFilterFromFilters(filter);
  const environmentFilter = new FilterList(
    convertEnvFilterToClickhouseFilter(envFilter),
  ).apply();
  const chFilter = new FilterList(
    createFilterFromFilterState(remainingFilters, dashboardColumnDefinitions),
  );
  const chFilterRes = chFilter.apply();

  const traceFilter = chFilter.find((f) => f.clickhouseTable === "traces");

  const [orderByQuery, orderByParams, bucketSizeInSeconds] = orderByTimeSeries(
    filter,
    "start_time_bucket",
  );

  const query = `
    SELECT 
      ${bucketSizeInSeconds ? selectTimeseriesColumn(bucketSizeInSeconds, "o.start_time", "start_time_bucket") + ", " : ""}
      count(*) as observation_count,
      level as level
    FROM observations o
    ${traceFilter ? "JOIN traces t ON o.trace_id = t.id AND o.project_id = t.project_id" : ""}
    WHERE project_id = {projectId: String}
    ${environmentFilter.query ? `AND ${environmentFilter.query}` : ""}
    AND o.level IS NOT NULL
    AND ${chFilterRes?.query}
    GROUP BY level ${bucketSizeInSeconds ? ", start_time_bucket" : ""}
    ${orderByQuery}
  `;

  const result = await queryClickhouse<{
    start_time_bucket?: string;
    observation_count: string;
    level: string;
  }>({
    query,
    params: {
      projectId,
      ...(chFilterRes ? chFilterRes.params : {}),
      ...environmentFilter.params,
      ...orderByParams,
    },
    tags: {
      feature: "dashboard",
      type: "observationStatusTimeSeries",
      kind: "analytic",
      projectId,
    },
  });

  return result.map((row) => ({
    start_time_bucket: row.start_time_bucket
      ? parseClickhouseUTCDateTimeFormat(row.start_time_bucket)
      : undefined,
    count: Number(row.observation_count),
    level: row.level,
  }));
};

export const orderByTimeSeries = (
  filter: FilterState,
  col: string,
): [string, { fromTime: number; toTime: number }, number] => {
  const potentialBucketSizesSeconds = [
    5, 10, 30, 60, 300, 600, 1800, 3600, 18000, 36000, 86400, 604800, 2592000,
  ];

  // Calculate time difference in seconds
  const [from, to] = extractFromAndToTimestampsFromFilter(filter);

  if (!from || !to) {
    throw new Error("Time Filter is required for time series queries");
  }

  const fromDate = new Date(from.value as Date);
  const toDate = new Date(to.value as Date);

  const diffInSeconds = Math.abs(toDate.getTime() - fromDate.getTime()) / 1000;

  // choose the bucket size that is the closest to the desired number of buckets
  const bucketSizeInSeconds = potentialBucketSizesSeconds.reduce(
    (closest, size) => {
      const diffFromDesiredBuckets = Math.abs(diffInSeconds / size - 50);
      return diffFromDesiredBuckets < closest.diffFromDesiredBuckets
        ? { size, diffFromDesiredBuckets }
        : closest;
    },
    { size: 0, diffFromDesiredBuckets: Infinity },
  ).size;

  // Convert to interval string
  const interval = `toIntervalSecond(${bucketSizeInSeconds})`;

  return [
    `ORDER BY ${col} ASC 
    WITH FILL
    FROM toStartOfInterval(toDateTime({fromTime: DateTime64(3)}), INTERVAL ${bucketSizeInSeconds} SECOND)
    TO toDateTime({toTime: DateTime64(3)}) + INTERVAL ${bucketSizeInSeconds} SECOND
    STEP ${interval}`,
    { fromTime: fromDate.getTime(), toTime: toDate.getTime() },
    bucketSizeInSeconds,
  ];
};

export const selectTimeseriesColumn = (
  bucketSizeInSeconds: number,
  col: string,
  as: String,
) => {
  return `toStartOfInterval(${col}, INTERVAL ${bucketSizeInSeconds} SECOND) as ${as}`;
};

export const extractFromAndToTimestampsFromFilter = (filter?: FilterState) => {
  if (!filter)
    throw new Error("Time Filter is required for time series queries");

  const fromTimestamp = filter.filter(
    (f) => f.type === "datetime" && (f.operator === ">" || f.operator === ">="),
  );

  const toTimestamp = filter.filter(
    (f) => f.type === "datetime" && (f.operator === "<" || f.operator === "<="),
  );

  return [fromTimestamp[0], toTimestamp[0]];
};
