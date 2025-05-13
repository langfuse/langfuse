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
} from "./constants";

export type DateTrunc = "month" | "week" | "day" | "hour" | "minute";

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

export const getObservationCostByTypeByTime = async (
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
        start_time, 
        groupArray((cost_key, cost_sum)) AS costs
    FROM (
        SELECT 
            ${selectTimeseriesColumn(bucketSizeInSeconds, "start_time", "start_time")},
            cost_key, 
            SUM(cost) AS cost_sum
        FROM 
            observations o FINAL
        ${tracesFilter ? "LEFT JOIN traces t ON o.trace_id = t.id AND o.project_id = t.project_id" : ""}
        ARRAY JOIN
            mapKeys(cost_details) AS cost_key, 
            mapValues(cost_details) AS cost
        WHERE project_id = {projectId: String}
        AND ${appliedFilter.query}
        ${environmentFilter.query ? `AND ${environmentFilter.query}` : ""}
        ${timeFilter ? `AND t.timestamp >= {traceTimestamp: DateTime64(3)} - ${OBSERVATIONS_TO_TRACE_INTERVAL}` : ""}
        GROUP BY 
            start_time, 
            cost_key
    ) 
    GROUP BY 
        start_time 
    ${orderByQuery}
  `;

  const result = await queryClickhouse<{
    start_time: string;
    costs: Array<[string, number | null]>;
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
      type: "observationCostByTypeByTime",
      kind: "analytic",
      projectId,
    },
  });

  const types = result.flatMap((row) => {
    return row.costs.map((cost) => cost[0]);
  });

  const uniqueTypes = [...new Set(types)];

  return result.flatMap((row) => {
    const intervalStart = parseClickhouseUTCDateTimeFormat(row.start_time);
    return uniqueTypes.map((type) => ({
      intervalStart: intervalStart,
      key: type,
      sum: row.costs.find((cost) => cost[0] === type)?.[1]
        ? Number(row.costs.find((cost) => cost[0] === type)?.[1])
        : 0,
    }));
  });
};

export const getObservationUsageByTypeByTime = async (
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
        start_time, 
        groupArray((usage_key, usage_sum)) AS usages
    FROM (
        SELECT 
            ${selectTimeseriesColumn(bucketSizeInSeconds, "start_time", "start_time")} ,
            usage_key, 
            SUM(usage) AS usage_sum
        FROM 
            observations o FINAL
        ${tracesFilter ? "LEFT JOIN traces t ON o.trace_id = t.id AND o.project_id = t.project_id" : ""}
        ARRAY JOIN
            mapKeys(usage_details) AS usage_key, 
            mapValues(usage_details) AS usage
        WHERE project_id = {projectId: String}
        AND ${appliedFilter.query}
        ${environmentFilter.query ? `AND ${environmentFilter.query}` : ""}
        ${timeFilter ? `AND t.timestamp >= {traceTimestamp: DateTime64(3)} - ${OBSERVATIONS_TO_TRACE_INTERVAL}` : ""}
        GROUP BY 
            start_time, 
            usage_key
    ) 
    GROUP BY 
        start_time 
    ${orderByQuery}
  `;

  const result = await queryClickhouse<{
    start_time: string;
    usages: Array<[string, number | null]>;
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

  const types = result.flatMap((row) => {
    return row.usages.map((usage) => usage[0]);
  });

  const uniqueTypes = [...new Set(types)];

  return result.flatMap((row) => {
    const intervalStart = parseClickhouseUTCDateTimeFormat(row.start_time);
    return uniqueTypes.map((type) => ({
      intervalStart: intervalStart,
      key: type,
      sum: row.usages.find((usage) => usage[0] === type)?.[1]
        ? Number(row.usages.find((usage) => usage[0] === type)?.[1])
        : 0,
    }));
  });
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
