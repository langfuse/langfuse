import {
  parseClickhouseUTCDateTimeFormat,
  queryClickhouse,
} from "./clickhouse";
import { queryDoris } from "./doris";
import { isDorisBackend, convertDateToAnalyticsDateTime, parseAnalyticsDateTimeFormat } from "./analytics";
import { createFilterFromFilterState } from "../queries/clickhouse-sql/factory";
import {
  createDorisFilterFromFilterState,
} from "../queries/doris-sql/factory";
import { FilterState } from "../../types";
import { DateTimeFilter, FilterList } from "../queries";
import {
  DateTimeFilter as DorisDateTimeFilter,
} from "../queries/doris-sql/doris-filter";
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

const convertEnvFilterToDorisFilter = (filter: FilterState) => {
  return createDorisFilterFromFilterState(filter, [
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
  if (isDorisBackend()) {
    const { envFilter, remainingFilters } =
      extractEnvironmentFilterFromFilters(filter);
    const environmentFilter = new FilterList(
      convertEnvFilterToDorisFilter(envFilter),
    ).apply();
    const dorisFilter = new FilterList(
      createDorisFilterFromFilterState(remainingFilters, dashboardColumnDefinitions),
    );

    const timeFilter = dorisFilter.find(
      (f) =>
        f.field === "timestamp" && (f.operator === ">=" || f.operator === ">"),
    ) as DorisDateTimeFilter | undefined;

    const dorisFilterApplied = dorisFilter.apply();

    const hasTraceFilter = dorisFilter.find((f) => f.table === "traces");

    // Doris UNIQUE KEY 保证数据唯一性，不需要 ROW_NUMBER() 去重
    const query = `
      SELECT 
        s.name,
        count(*) as count,
        avg(s.value) as avg_value,
        s.source,
        s.data_type
      FROM scores s
      ${hasTraceFilter ? `JOIN traces t ON t.id = s.trace_id AND t.project_id = s.project_id` : ""}
      WHERE s.project_id = {projectId: String}
      ${dorisFilterApplied.query ? `AND ${dorisFilterApplied.query}` : ""}
      ${environmentFilter.query ? `AND ${environmentFilter.query}` : ""}
      ${timeFilter && hasTraceFilter ? `AND t.timestamp >= DATE_SUB({tracesTimestamp: DateTime}, INTERVAL 2 DAY)` : ""}
      GROUP BY s.name, s.source, s.data_type
      ORDER BY count(*) DESC
      `;

    const result = await queryDoris<{
      name: string;
      count: string;
      avg_value: string;
      source: string;
      data_type: string;
    }>({
      query,
      params: {
        projectId,
        ...dorisFilterApplied.params,
        ...environmentFilter.params,
        ...(timeFilter
          ? { tracesTimestamp: convertDateToAnalyticsDateTime(timeFilter.value) }
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
  }

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

  const hasTraceFilter = chFilter.find((f) => f.table === "traces");
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
  if (isDorisBackend()) {
    const { envFilter, remainingFilters } =
      extractEnvironmentFilterFromFilters(filter);
    const environmentFilter = new FilterList(
      convertEnvFilterToDorisFilter(envFilter),
    ).apply();
    const dorisFilter = new FilterList(
      createDorisFilterFromFilterState(remainingFilters, dashboardColumnDefinitions),
    );

    const appliedFilter = dorisFilter.apply();

    const tracesFilter = dorisFilter.find((f) => f.table === "traces");
    const timeFilter = tracesFilter
      ? (dorisFilter.find(
          (f) =>
            f.table === "observations" &&
            f.field.includes("start_time") &&
            (f.operator === ">=" || f.operator === ">"),
        ) as DorisDateTimeFilter | undefined)
      : undefined;

    const [orderByQuery, orderByParams, bucketSizeInSeconds] = orderByTimeSeriesDoris(
      filter,
      "start_time",
    );

    // Doris UNIQUE KEY 保证数据唯一性，无需去重
    // 使用 collect_list 模拟 ClickHouse 的 groupArray 结构
    const query = `
      SELECT 
          start_time,
          collect_list(CONCAT(cost_key, ':', CAST(cost_sum AS STRING))) AS costs
      FROM (
          SELECT 
              ${selectTimeseriesColumnDoris(bucketSizeInSeconds, "start_time", "start_time")},
              keys_exploded.cost_key as cost_key, 
              SUM(values_exploded.cost_value) AS cost_sum
          FROM observations o
          LATERAL VIEW posexplode(map_keys(cost_details)) keys_exploded AS key_pos, cost_key
          LATERAL VIEW posexplode(map_values(cost_details)) values_exploded AS value_pos, cost_value
          ${tracesFilter ? `LEFT JOIN traces t ON o.trace_id = t.id AND o.project_id = t.project_id` : ""}
          WHERE o.project_id = {projectId: String}
          ${appliedFilter.query ? `AND ${appliedFilter.query}` : ""}
          ${environmentFilter.query ? `AND ${environmentFilter.query}` : ""}
          ${timeFilter ? `AND t.timestamp >= DATE_SUB({traceTimestamp: DateTime}, INTERVAL 2 DAY)` : ""}
          AND cost_details IS NOT NULL
          AND keys_exploded.key_pos = values_exploded.value_pos
          GROUP BY 
              start_time, 
              cost_key
      ) subquery
      GROUP BY 
          start_time 
      ${orderByQuery}
    `;

    const result = await queryDoris<{
      start_time: string | Date;
      costs: string[] | string;  // 格式: ["key1:value1", "key2:value2", ...] 或字符串化的数组
    }>({
      query,
      params: {
        projectId,
        ...appliedFilter.params,
        ...environmentFilter.params,
        ...orderByParams,
        ...(timeFilter
          ? { traceTimestamp: convertDateToAnalyticsDateTime(timeFilter.value) }
          : {}),
      },
      tags: {
        feature: "dashboard",
        type: "observationCostByTypeByTime",
        kind: "analytic",
        projectId,
      },
    });

    // 解析字符串格式的 costs，转换为与 ClickHouse 相同的元组格式
    const processedResult = result.map((row) => {
      let costArray: string[] = [];
      
      // 处理 Doris 返回的字符串化数组
      if (typeof row.costs === 'string') {
        try {
          costArray = JSON.parse(row.costs);
        } catch (e) {
          console.error('Failed to parse costs JSON:', e);
          costArray = [];
        }
      } else if (Array.isArray(row.costs)) {
        costArray = row.costs;
      }
      
      return {
        start_time: row.start_time,
        costs: costArray.map((cost): [string, number | null] => {
          const [key, value] = cost.split(':');
          return [key, value ? Number(value) : null];
        }),
      };
    });

    // 使用与 ClickHouse 相同的处理逻辑
    const types = processedResult.flatMap((row) => {
      return row.costs.map((cost) => cost[0]);
    });

    const uniqueTypes = [...new Set(types)];

    return processedResult.flatMap((row) => {
      const timeString = typeof row.start_time === 'string' 
        ? row.start_time 
        : (row.start_time as Date).toISOString();
      const intervalStart = parseAnalyticsDateTimeFormat(timeString);
      return uniqueTypes.map((type) => ({
        intervalStart: intervalStart,
        key: type,
        sum: row.costs.find((cost) => cost[0] === type)?.[1]
          ? Number(row.costs.find((cost) => cost[0] === type)?.[1])
          : 0,
      }));
    });
  }

  const { envFilter, remainingFilters } =
    extractEnvironmentFilterFromFilters(filter);
  const environmentFilter = new FilterList(
    convertEnvFilterToClickhouseFilter(envFilter),
  ).apply();
  const chFilter = new FilterList(
    createFilterFromFilterState(remainingFilters, dashboardColumnDefinitions),
  );

  const appliedFilter = chFilter.apply();

  const tracesFilter = chFilter.find((f) => f.table === "traces");
  const timeFilter = tracesFilter
    ? (chFilter.find(
        (f) =>
          f.table === "observations" &&
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
  if (isDorisBackend()) {
    const { envFilter, remainingFilters } =
      extractEnvironmentFilterFromFilters(filter);
    const environmentFilter = new FilterList(
      convertEnvFilterToDorisFilter(envFilter),
    ).apply();
    const dorisFilter = new FilterList(
      createDorisFilterFromFilterState(remainingFilters, dashboardColumnDefinitions),
    );

    const appliedFilter = dorisFilter.apply();

    const tracesFilter = dorisFilter.find((f) => f.table === "traces");
    const timeFilter = tracesFilter
      ? (dorisFilter.find(
          (f) =>
            f.table === "observations" &&
            f.field.includes("start_time") &&
            (f.operator === ">=" || f.operator === ">"),
        ) as DorisDateTimeFilter | undefined)
      : undefined;

    const [orderByQuery, orderByParams, bucketSizeInSeconds] = orderByTimeSeriesDoris(
      filter,
      "start_time",
    );

    // Doris UNIQUE KEY 保证数据唯一性，无需去重
    // 使用 collect_list 模拟 ClickHouse 的 groupArray 结构
    const query = `
      SELECT 
          start_time,
          collect_list(CONCAT(usage_key, ':', CAST(usage_sum AS STRING))) AS usages
      FROM (
          SELECT 
              ${selectTimeseriesColumnDoris(bucketSizeInSeconds, "start_time", "start_time")},
              keys_exploded.usage_key as usage_key, 
              SUM(values_exploded.usage_value) AS usage_sum
          FROM observations o
          LATERAL VIEW posexplode(map_keys(usage_details)) keys_exploded AS key_pos, usage_key
          LATERAL VIEW posexplode(map_values(usage_details)) values_exploded AS value_pos, usage_value
          ${tracesFilter ? `LEFT JOIN traces t ON o.trace_id = t.id AND o.project_id = t.project_id` : ""}
          WHERE o.project_id = {projectId: String}
          ${appliedFilter.query ? `AND ${appliedFilter.query}` : ""}
          ${environmentFilter.query ? `AND ${environmentFilter.query}` : ""}
          ${timeFilter ? `AND t.timestamp >= DATE_SUB({traceTimestamp: DateTime}, INTERVAL 2 DAY)` : ""}
          AND usage_details IS NOT NULL
          AND keys_exploded.key_pos = values_exploded.value_pos
          GROUP BY 
              start_time, 
              usage_key
      ) subquery
      GROUP BY 
          start_time 
      ${orderByQuery}
    `;

    const result = await queryDoris<{
      start_time: string | Date;
      usages: string[] | string;  // 格式: ["key1:value1", "key2:value2", ...] 或字符串化的数组
    }>({
      query,
      params: {
        projectId,
        ...appliedFilter.params,
        ...environmentFilter.params,
        ...orderByParams,
        ...(timeFilter
          ? { traceTimestamp: convertDateToAnalyticsDateTime(timeFilter.value) }
          : {}),
      },
      tags: {
        feature: "dashboard",
        type: "observationUsageByTime",
        kind: "analytic",
        projectId,
      },
    });

    // 解析字符串格式的 usages，转换为与 ClickHouse 相同的元组格式
    const processedResult = result.map((row) => {
      let usageArray: string[] = [];
      
      // 处理 Doris 返回的字符串化数组
      if (typeof row.usages === 'string') {
        try {
          usageArray = JSON.parse(row.usages);
        } catch (e) {
          console.error('Failed to parse usages JSON:', e);
          usageArray = [];
        }
      } else if (Array.isArray(row.usages)) {
        usageArray = row.usages;
      }
      
      return {
        start_time: row.start_time,
        usages: usageArray.map((usage): [string, number | null] => {
          const [key, value] = usage.split(':');
          return [key, value ? Number(value) : null];
        }),
      };
    });

    // 使用与 ClickHouse 相同的处理逻辑
    const types = processedResult.flatMap((row) => {
      return row.usages.map((usage) => usage[0]);
    });

    const uniqueTypes = [...new Set(types)];

    return processedResult.flatMap((row) => {
      const timeString = typeof row.start_time === 'string' 
        ? row.start_time 
        : (row.start_time as Date).toISOString();
      const intervalStart = parseAnalyticsDateTimeFormat(timeString);
      return uniqueTypes.map((type) => ({
        intervalStart: intervalStart,
        key: type,
        sum: row.usages.find((usage) => usage[0] === type)?.[1]
          ? Number(row.usages.find((usage) => usage[0] === type)?.[1])
          : 0,
      }));
    });
  }

  const { envFilter, remainingFilters } =
    extractEnvironmentFilterFromFilters(filter);
  const environmentFilter = new FilterList(
    convertEnvFilterToClickhouseFilter(envFilter),
  ).apply();
  const chFilter = new FilterList(
    createFilterFromFilterState(remainingFilters, dashboardColumnDefinitions),
  );

  const appliedFilter = chFilter.apply();

  const tracesFilter = chFilter.find((f) => f.table === "traces");
  const timeFilter = tracesFilter
    ? (chFilter.find(
        (f) =>
          f.table === "observations" &&
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

export const orderByTimeSeriesDoris = (
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

  return [
    `ORDER BY ${col} ASC`,
    { fromTime: fromDate.getTime(), toTime: toDate.getTime() },
    bucketSizeInSeconds,
  ];
};

export const selectTimeseriesColumnDoris = (
  bucketSizeInSeconds: number,
  col: string,
  as: String,
) => {
  // Use DATE_TRUNC for better performance in Doris with DateTime(3) fields
  if (bucketSizeInSeconds >= 86400) {
    return `DATE_TRUNC(${col}, 'day') as ${as}`;
  } else if (bucketSizeInSeconds >= 3600) {
    return `DATE_TRUNC(${col}, 'hour') as ${as}`;
  } else if (bucketSizeInSeconds >= 60) {
    return `DATE_TRUNC(${col}, 'minute') as ${as}`;
  } else {
    // For sub-minute intervals, use DATE_TRUNC with second precision and manual bucketing
    // Since col is now DateTime(3), we can use DATE_TRUNC directly
    return `DATE_TRUNC(FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(${col}) / ${bucketSizeInSeconds}) * ${bucketSizeInSeconds}), 'second') as ${as}`;
  }
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
