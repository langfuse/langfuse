/**
 * Logic mirrors repositories/dashboards.ts (ClickHouse); syntax adapted for OceanBase.
 * Same exports and flow: getScoreAggregate, getObservationCostByTypeByTime, getObservationUsageByTypeByTime,
 * orderByTimeSeries, selectTimeseriesColumn, extractFromAndToTimestampsFromFilter.
 */
import { DatabaseAdapterFactory } from "../database";
import { createFilterFromFilterState } from "../queries/oceanbase-sql/factory";
import { FilterState } from "../../types";
import { DateTimeFilter, FilterList } from "../queries";
import { dashboardColumnDefinitions } from "../tableMappings";
import { convertDateToDateTime } from "../database";
import {
  OBSERVATIONS_TO_TRACE_INTERVAL,
  SCORE_TO_TRACE_OBSERVATIONS_INTERVAL,
} from "../repositories/constants";
import { convertFilterParamsToPositional } from "../database/oceanbase-filter-helper";

export type DateTrunc = "month" | "week" | "day" | "hour" | "minute";

const extractEnvironmentFilterFromFilters = (
  filter: FilterState,
): { envFilter: FilterState; remainingFilters: FilterState } => {
  return {
    envFilter: filter.filter((f) => f.column === "environment"),
    remainingFilters: filter.filter((f) => f.column !== "environment"),
  };
};

const convertEnvFilterToClickhouseFilter = (
  filter: FilterState,
  queryPrefix: string,
) => {
  return createFilterFromFilterState(filter, [
    {
      clickhouseSelect: "environment",
      clickhouseTableName: "traces",
      uiTableId: "environment",
      uiTableName: "Environment",
      queryPrefix,
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
    convertEnvFilterToClickhouseFilter(envFilter, "s"),
  ).apply();

  // Create column mappings with table prefixes for scores
  const scoreColumnMappings = dashboardColumnDefinitions.map((col) => {
    if (col.clickhouseTableName === "scores") {
      return {
        ...col,
        clickhouseSelect: col.clickhouseSelect.includes(".")
          ? col.clickhouseSelect
          : `s.${col.clickhouseSelect}`,
      };
    }
    return col;
  });

  const chFilter = new FilterList(
    createFilterFromFilterState(remainingFilters, scoreColumnMappings),
  );

  const timeFilter = chFilter.find(
    (f) =>
      f.field === "timestamp" && (f.operator === ">=" || f.operator === ">"),
  ) as DateTimeFilter | undefined;

  const chFilterApplied = chFilter.apply();

  // Convert filter query and params for OceanBase
  let filterQuery = chFilterApplied.query;
  let filterParams: unknown[] = [];
  if (chFilterApplied.params) {
    const converted = convertFilterParamsToPositional(
      chFilterApplied.query,
      chFilterApplied.params,
    );
    filterQuery = converted.query;
    filterParams = converted.params;
  }

  // Convert environment filter query and params for OceanBase
  let envFilterQuery = environmentFilter.query || "";
  let envFilterParams: unknown[] = [];
  if (environmentFilter.params) {
    const converted = convertFilterParamsToPositional(
      environmentFilter.query || "",
      environmentFilter.params,
    );
    envFilterQuery = converted.query;
    envFilterParams = converted.params;
  }

  const hasTraceFilter = chFilter.find((f) => f.clickhouseTable === "traces");
  // TODO: Validate whether we can filter traces on timestamp here.

  const query = `
    SELECT 
      s.name,
      COUNT(*) as count,
      AVG(s.value) as avg_value,
      s.source,
      s.data_type
    FROM (
      SELECT *,
        ROW_NUMBER() OVER (PARTITION BY s.id, s.project_id ORDER BY s.\`event_ts\` DESC) as rn
      FROM scores s
    ) s
    ${
      hasTraceFilter
        ? `JOIN (
      SELECT *,
        ROW_NUMBER() OVER (PARTITION BY t.id, t.project_id ORDER BY t.\`event_ts\` DESC) as rn
      FROM traces t
    ) t ON t.id = s.trace_id AND t.project_id = s.project_id AND t.rn = 1`
        : ""
    }
    WHERE s.rn = 1
    AND s.project_id = ?
    AND ${filterQuery}
    ${envFilterQuery ? `AND ${envFilterQuery}` : ""}
    ${timeFilter && hasTraceFilter ? `AND t.timestamp >= DATE_SUB(?, ${SCORE_TO_TRACE_OBSERVATIONS_INTERVAL})` : ""}
    GROUP BY s.name, s.source, s.data_type
    ORDER BY COUNT(*) DESC
    `;

  const adapter = DatabaseAdapterFactory.getInstance();
  const params: unknown[] = [
    projectId,
    ...filterParams,
    ...envFilterParams,
    ...(timeFilter && hasTraceFilter
      ? [convertDateToDateTime(timeFilter.value)]
      : []),
  ];
  const result = await adapter.queryWithOptions<{
    name: string;
    count: string;
    avg_value: string;
    source: string;
    data_type: string;
  }>({
    query,
    params,
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
    convertEnvFilterToClickhouseFilter(envFilter, "o"),
  ).apply();

  // Create column mappings with table prefixes for observations and traces
  const observationColumnMappings = dashboardColumnDefinitions.map((col) => {
    if (col.clickhouseTableName === "observations") {
      return {
        ...col,
        clickhouseSelect: col.clickhouseSelect.includes(".")
          ? col.clickhouseSelect
          : `o.${col.clickhouseSelect}`,
      };
    }
    return col;
  });

  const chFilter = new FilterList(
    createFilterFromFilterState(remainingFilters, observationColumnMappings),
  );

  const appliedFilter = chFilter.apply();

  // Convert filter query and params for OceanBase
  let filterQuery = appliedFilter.query;
  let filterParams: unknown[] = [];
  if (appliedFilter.params) {
    const converted = convertFilterParamsToPositional(
      appliedFilter.query,
      appliedFilter.params,
    );
    filterQuery = converted.query;
    filterParams = converted.params;
  }

  // Convert environment filter query and params for OceanBase
  let envFilterQuery = environmentFilter.query || "";
  let envFilterParams: unknown[] = [];
  if (environmentFilter.params) {
    const converted = convertFilterParamsToPositional(
      environmentFilter.query || "",
      environmentFilter.params,
    );
    envFilterQuery = converted.query;
    envFilterParams = converted.params;
  }

  const tracesFilter = chFilter.find((f) => f.clickhouseTable === "traces");
  const timeFilter = tracesFilter
    ? (chFilter.find(
        (f) =>
          f.clickhouseTable === "observations" &&
          f.field.includes("start_time") &&
          (f.operator === ">=" || f.operator === ">"),
      ) as DateTimeFilter | undefined)
    : undefined;

  const [orderByQuery, , bucketSizeInSeconds] = orderByTimeSeries(
    filter,
    "start_time",
  );

  const query = `
    SELECT 
        start_time, 
        JSON_ARRAYAGG(
          JSON_ARRAY(cost_key, cost_sum)
        ) AS costs
    FROM (
        SELECT 
            ${selectTimeseriesColumn(bucketSizeInSeconds, "start_time", "start_time")},
            cost_key, 
            SUM(cost_val) AS cost_sum
        FROM (
          SELECT 
            ${selectTimeseriesColumn(bucketSizeInSeconds, "o.start_time", "start_time")},
            JSON_UNQUOTE(JSON_EXTRACT(JSON_KEYS(o.cost_details), CONCAT('$[', n.n, ']'))) AS cost_key,
            CONVERT(JSON_UNQUOTE(JSON_EXTRACT(o.cost_details, CONCAT('$.', JSON_UNQUOTE(JSON_EXTRACT(JSON_KEYS(o.cost_details), CONCAT('$[', n.n, ']')))))), DECIMAL(10, 4)) AS cost_val
          FROM (
            SELECT 
              o.*,
              ROW_NUMBER() OVER (PARTITION BY o.id, o.project_id ORDER BY o.\`event_ts\` DESC) as rn
            FROM observations o
          ) o
          CROSS JOIN (
            SELECT 0 as n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 
            UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9
            UNION SELECT 10 UNION SELECT 11 UNION SELECT 12 UNION SELECT 13 UNION SELECT 14
            UNION SELECT 15 UNION SELECT 16 UNION SELECT 17 UNION SELECT 18 UNION SELECT 19
          ) n
          ${
            tracesFilter
              ? `LEFT JOIN (
            SELECT 
              t.*,
              ROW_NUMBER() OVER (PARTITION BY t.id, t.project_id ORDER BY t.\`event_ts\` DESC) as rn
            FROM traces t
          ) t ON t.id = o.trace_id AND t.project_id = o.project_id AND t.rn = 1`
              : ""
          }
          WHERE o.rn = 1
          AND o.project_id = ?
          AND ${filterQuery}
          ${envFilterQuery ? `AND ${envFilterQuery}` : ""}
          ${timeFilter ? `AND t.timestamp >= DATE_SUB(?, ${OBSERVATIONS_TO_TRACE_INTERVAL})` : ""}
          AND JSON_EXTRACT(JSON_KEYS(o.cost_details), CONCAT('$[', n.n, ']')) IS NOT NULL
        ) expanded
        GROUP BY 
            start_time, 
            cost_key
    ) aggregated
    GROUP BY 
        start_time 
    ${orderByQuery}
  `;

  const adapter = DatabaseAdapterFactory.getInstance();
  const params: unknown[] = [
    projectId,
    ...filterParams,
    ...envFilterParams,
    ...(timeFilter ? [convertDateToDateTime(timeFilter.value)] : []),
  ];
  const result = await adapter.queryWithOptions<{
    start_time: string;
    costs: string; // JSON string that needs to be parsed
  }>({
    query,
    params,
    tags: {
      feature: "dashboard",
      type: "observationCostByTypeByTime",
      kind: "analytic",
      projectId,
    },
  });

  // Parse JSON costs array
  const parsedResult = result.map((row) => {
    let costs: Array<[string, number | null]> = [];
    try {
      const parsed = JSON.parse(row.costs);
      if (Array.isArray(parsed)) {
        costs = parsed.map((item) => {
          if (Array.isArray(item) && item.length >= 2) {
            return [String(item[0]), item[1] !== null ? Number(item[1]) : null];
          }
          return [String(item), null];
        });
      }
    } catch (e) {
      // If parsing fails, return empty array
      costs = [];
    }
    return { ...row, costs };
  });

  const types = parsedResult.flatMap((row) => {
    return row.costs.map((cost) => cost[0]);
  });

  const uniqueTypes = [...new Set(types)];

  return parsedResult.flatMap((row) => {
    const intervalStart = adapter.parseUTCDateTimeFormat(row.start_time);
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
    convertEnvFilterToClickhouseFilter(envFilter, "o"),
  ).apply();

  // Create column mappings with table prefixes for observations and traces
  const observationColumnMappings = dashboardColumnDefinitions.map((col) => {
    if (col.clickhouseTableName === "observations") {
      return {
        ...col,
        clickhouseSelect: col.clickhouseSelect.includes(".")
          ? col.clickhouseSelect
          : `o.${col.clickhouseSelect}`,
      };
    }
    return col;
  });

  const chFilter = new FilterList(
    createFilterFromFilterState(remainingFilters, observationColumnMappings),
  );

  const appliedFilter = chFilter.apply();

  // Convert filter query and params for OceanBase
  let filterQuery = appliedFilter.query;
  let filterParams: unknown[] = [];
  if (appliedFilter.params) {
    const converted = convertFilterParamsToPositional(
      appliedFilter.query,
      appliedFilter.params,
    );
    filterQuery = converted.query;
    filterParams = converted.params;
  }

  // Convert environment filter query and params for OceanBase
  let envFilterQuery = environmentFilter.query || "";
  let envFilterParams: unknown[] = [];
  if (environmentFilter.params) {
    const converted = convertFilterParamsToPositional(
      environmentFilter.query || "",
      environmentFilter.params,
    );
    envFilterQuery = converted.query;
    envFilterParams = converted.params;
  }

  const tracesFilter = chFilter.find((f) => f.clickhouseTable === "traces");
  const timeFilter = tracesFilter
    ? (chFilter.find(
        (f) =>
          f.clickhouseTable === "observations" &&
          f.field.includes("start_time") &&
          (f.operator === ">=" || f.operator === ">"),
      ) as DateTimeFilter | undefined)
    : undefined;

  const [orderByQuery, , bucketSizeInSeconds] = orderByTimeSeries(
    filter,
    "start_time",
  );

  const query = `
    SELECT 
        start_time, 
        JSON_ARRAYAGG(
          JSON_ARRAY(usage_key, usage_sum)
        ) AS usages
    FROM (
        SELECT 
            ${selectTimeseriesColumn(bucketSizeInSeconds, "start_time", "start_time")},
            usage_key, 
            SUM(usage_val) AS usage_sum
        FROM (
          SELECT 
            ${selectTimeseriesColumn(bucketSizeInSeconds, "o.start_time", "start_time")},
            JSON_UNQUOTE(JSON_EXTRACT(JSON_KEYS(o.usage_details), CONCAT('$[', n.n, ']'))) AS usage_key,
            CONVERT(JSON_UNQUOTE(JSON_EXTRACT(o.usage_details, CONCAT('$.', JSON_UNQUOTE(JSON_EXTRACT(JSON_KEYS(o.usage_details), CONCAT('$[', n.n, ']')))))), UNSIGNED) AS usage_val
          FROM (
            SELECT 
              o.*,
              ROW_NUMBER() OVER (PARTITION BY o.id, o.project_id ORDER BY o.\`event_ts\` DESC) as rn
            FROM observations o
          ) o
          CROSS JOIN (
            SELECT 0 as n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 
            UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9
            UNION SELECT 10 UNION SELECT 11 UNION SELECT 12 UNION SELECT 13 UNION SELECT 14
            UNION SELECT 15 UNION SELECT 16 UNION SELECT 17 UNION SELECT 18 UNION SELECT 19
          ) n
          ${
            tracesFilter
              ? `LEFT JOIN (
            SELECT 
              t.*,
              ROW_NUMBER() OVER (PARTITION BY t.id, t.project_id ORDER BY t.\`event_ts\` DESC) as rn
            FROM traces t
          ) t ON t.id = o.trace_id AND t.project_id = o.project_id AND t.rn = 1`
              : ""
          }
          WHERE o.rn = 1
          AND o.project_id = ?
          AND ${filterQuery}
          ${envFilterQuery ? `AND ${envFilterQuery}` : ""}
          ${timeFilter ? `AND t.timestamp >= DATE_SUB(?, ${OBSERVATIONS_TO_TRACE_INTERVAL})` : ""}
          AND JSON_EXTRACT(JSON_KEYS(o.usage_details), CONCAT('$[', n.n, ']')) IS NOT NULL
        ) expanded
        GROUP BY 
            start_time, 
            usage_key
    ) aggregated
    GROUP BY 
        start_time 
    ${orderByQuery}
  `;

  const adapter = DatabaseAdapterFactory.getInstance();
  const params: unknown[] = [
    projectId,
    ...filterParams,
    ...envFilterParams,
    ...(timeFilter ? [convertDateToDateTime(timeFilter.value)] : []),
  ];
  const result = await adapter.queryWithOptions<{
    start_time: string;
    usages: string; // JSON string that needs to be parsed
  }>({
    query,
    params,
    tags: {
      feature: "dashboard",
      type: "observationUsageByTime",
      kind: "analytic",
      projectId,
    },
  });

  // Parse JSON usages array
  const parsedResult = result.map((row) => {
    let usages: Array<[string, number | null]> = [];
    try {
      const parsed = JSON.parse(row.usages);
      if (Array.isArray(parsed)) {
        usages = parsed.map((item) => {
          if (Array.isArray(item) && item.length >= 2) {
            return [String(item[0]), item[1] !== null ? Number(item[1]) : null];
          }
          return [String(item), null];
        });
      }
    } catch (e) {
      // If parsing fails, return empty array
      usages = [];
    }
    return { ...row, usages };
  });

  const types = parsedResult.flatMap((row) => {
    return row.usages.map((usage) => usage[0]);
  });

  const uniqueTypes = [...new Set(types)];

  return parsedResult.flatMap((row) => {
    const intervalStart = adapter.parseUTCDateTimeFormat(row.start_time);
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

  // Convert to MySQL/OceanBase compatible ORDER BY
  // Note: WITH FILL is ClickHouse-specific and not supported in MySQL/OceanBase
  // We'll just order by the column without filling gaps
  return [
    `ORDER BY ${col} ASC`,
    { fromTime: fromDate.getTime(), toTime: toDate.getTime() },
    bucketSizeInSeconds,
  ];
};

export const selectTimeseriesColumn = (
  bucketSizeInSeconds: number,
  col: string,
  as: String,
) => {
  // For OceanBase/MySQL compatibility:
  // Since observations.start_time is stored as bigint (Unix timestamp in milliseconds),
  // we need to handle it differently from DATETIME columns
  //
  // Strategy: Convert milliseconds to seconds, floor to bucket, then convert back to DATETIME
  // OceanBase does NOT support FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP())) syntax
  return `FROM_UNIXTIME(FLOOR((${col} / 1000) / ${bucketSizeInSeconds}) * ${bucketSizeInSeconds}) as ${as}`;
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
