import { DatasetRunItemDomain } from "../../domain/dataset-run-items";
import { type OrderByState } from "../../interfaces/orderBy";
import { datasetRunItemsTableUiColumnDefinitions } from "../tableMappings";
import { datasetRunsTableUiColumnDefinitions } from "../../tableDefinitions/mapDatasetRunsTable";
import { FilterState } from "../../types";
import {
  createFilterFromFilterState,
  FilterList,
  orderByToClickhouseSql,
  StringFilter,
  StringOptionsFilter,
} from "../queries";
import {
  parseClickhouseUTCDateTimeFormat,
  queryClickhouse,
} from "./clickhouse";
import { convertDatasetRunItemClickhouseToDomain } from "./dataset-run-items-converters";
import { DatasetRunItemRecord } from "./definitions";
import { env } from "../../env";
import { commandClickhouse } from "./clickhouse";
import Decimal from "decimal.js";
import { ClickHouseClientConfigOptions } from "@clickhouse/client";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import { ScoreAggregate } from "../../features/scores";

type DatasetItemIdsByTraceIdQuery = {
  projectId: string;
  traceId: string;
  // this filter should include a dataset_id filter to search along primary key
  filter: FilterState;
};

type DatasetRunItemsTableQuery = {
  projectId: string;
  filter: FilterState;
  datasetId?: string;
  orderBy?: OrderByState | OrderByState[];
  limit?: number;
  offset?: number;
  clickhouseConfigs?: ClickHouseClientConfigOptions;
};

type BaseDatasetItemWithRunDataQuery = {
  projectId: string;
  datasetId: string;
  runIds: string[];
  filterByRun: {
    runId: string;
    filters: FilterState;
  }[];
};

type DatasetItemIdsWithRunDataQuery = BaseDatasetItemWithRunDataQuery & {
  limit?: number;
  offset?: number;
};

type DatasetItemsWithRunDataCountQuery = BaseDatasetItemWithRunDataQuery;

type DatasetRunItemsByDatasetIdQuery = Omit<
  DatasetRunItemsTableQuery,
  "datasetId"
> & {
  datasetId: string;
};

type DatasetRunsMetricsTableQuery = {
  select: "rows" | "metrics" | "count";
  projectId: string;
  datasetId: string;
  filter: FilterState;
  runIds?: string[];
  orderBy?: OrderByState;
  limit?: number;
  offset?: number;
};

type BaseDatasetRunItemsWithoutIOQuery = {
  projectId: string;
  datasetId: string;
  runIds: string[];
};

type DatasetRunItemsByItemIdsWithoutIOQuery =
  BaseDatasetRunItemsWithoutIOQuery & {
    datasetItemIds: string[];
  };

export type DatasetRunsMetrics = {
  id: string;
  name: string;
  projectId: string;
  datasetId: string;
  countRunItems: number;
  avgTotalCost: Decimal;
  totalCost: Decimal;
  avgLatency: number;
  aggScoresAvg: Array<[string, number]>;
  aggScoreCategories: string[];
};

type DatasetRunsRows = {
  id: string;
  name: string;
  projectId: string;
  createdAt: Date;
  datasetId: string;
  description: string;
  metadata: string;
};

type DatasetRunsMetricsRecordType = {
  dataset_run_id: string;
  dataset_run_name: string;
  project_id: string;
  dataset_id: string;
  count_run_items: number;
  avg_latency_seconds: number;
  avg_total_cost: number;
  total_cost: number;
  agg_scores_avg: Array<[string, number]>;
  agg_score_categories: string[];
};

type DatasetRunsRowsRecordType = {
  dataset_run_id: string;
  dataset_run_name: string;
  project_id: string;
  dataset_id: string;
  dataset_run_created_at: string;
  dataset_run_description: string;
  dataset_run_metadata: string;
};

export type EnrichedDatasetRunItem = {
  id: string;
  createdAt: Date;
  datasetItemId: string;
  datasetItemVersion: Date | undefined;
  datasetRunId: string;
  datasetRunName: string;
  observation:
    | {
        id: string;
        latency: number;
        calculatedTotalCost: Decimal;
      }
    | undefined;
  trace: {
    id: string;
    duration: number;
    totalCost: number;
  };
  scores: ScoreAggregate;
};

const convertDatasetRunsMetricsRecord = (
  record: DatasetRunsMetricsRecordType,
): DatasetRunsMetrics => {
  return {
    id: record.dataset_run_id,
    name: record.dataset_run_name,
    projectId: record.project_id,
    datasetId: record.dataset_id,
    countRunItems: record.count_run_items,
    avgTotalCost: record.avg_total_cost
      ? new Decimal(record.avg_total_cost)
      : new Decimal(0),
    totalCost: record.total_cost
      ? new Decimal(record.total_cost)
      : new Decimal(0),
    avgLatency: record.avg_latency_seconds ?? 0,
    aggScoresAvg: record.agg_scores_avg ?? [],
    aggScoreCategories: record.agg_score_categories ?? [],
  };
};

const convertDatasetRunsRowsRecord = (
  record: DatasetRunsRowsRecordType,
): DatasetRunsRows => {
  return {
    id: record.dataset_run_id,
    name: record.dataset_run_name,
    projectId: record.project_id,
    createdAt: parseClickhouseUTCDateTimeFormat(record.dataset_run_created_at),
    datasetId: record.dataset_id,
    description: record.dataset_run_description,
    metadata: record.dataset_run_metadata,
  };
};

const getProjectDatasetIdDefaultFilter = (
  projectId: string,
  datasetId?: string,
  runIds?: string[],
) => {
  return {
    datasetRunItemsFilter: new FilterList([
      new StringFilter({
        clickhouseTable: "dataset_run_items_rmt",
        field: "project_id",
        operator: "=",
        value: projectId,
      }),
      ...(datasetId
        ? [
            new StringFilter({
              clickhouseTable: "dataset_run_items_rmt",
              field: "dataset_id",
              operator: "=",
              value: datasetId,
            }),
          ]
        : []),
      ...(runIds && runIds.length > 0
        ? [
            new StringOptionsFilter({
              clickhouseTable: "dataset_run_items_rmt",
              field: "dataset_run_id",
              operator: "any of",
              values: runIds,
            }),
          ]
        : []),
    ]),
  };
};

const getDatasetRunsTableInternal = async <T>(
  opts: DatasetRunsMetricsTableQuery & {
    tags: Record<string, string>;
  },
): Promise<Array<T>> => {
  const { projectId, datasetId, runIds, filter, orderBy, limit, offset } = opts;
  let select = "";

  switch (opts.select) {
    case "rows":
      select = `
        drm.project_id as project_id,
        drm.dataset_id as dataset_id,
        drm.dataset_run_id as dataset_run_id,
        drm.dataset_run_name as dataset_run_name,
        drm.dataset_run_created_at as dataset_run_created_at,
        drm.dataset_run_description as dataset_run_description,
        drm.dataset_run_metadata as dataset_run_metadata
      `;
      break;
    case "metrics":
      select = `
        drm.project_id as project_id,
        drm.dataset_id as dataset_id,
        drm.dataset_run_id as dataset_run_id,
        drm.dataset_run_name as dataset_run_name,
        drm.count_run_items as count_run_items,
        
        -- Latency metrics (priority: trace > observation - matching old PostgreSQL behavior)
        CASE
          WHEN drm.trace_avg_latency IS NOT NULL THEN drm.trace_avg_latency
          ELSE drm.obs_avg_latency
        END as avg_latency_seconds,
        
        -- Cost metrics (priority: trace > observation - matching old PostgreSQL behavior)  
        CASE
          WHEN drm.trace_avg_cost IS NOT NULL THEN drm.trace_avg_cost
          ELSE COALESCE(drm.obs_avg_cost, 0)
        END as avg_total_cost,
        CASE
          WHEN drm.trace_total_cost IS NOT NULL THEN drm.trace_total_cost
          ELSE COALESCE(drm.obs_total_cost, 0)
        END as total_cost,

        -- Score aggregations
        sa.scores_avg as agg_scores_avg,
        sa.score_categories as agg_score_categories`;
      break;
    case "count":
      select = "count(DISTINCT drm.dataset_run_id) as count";
      break;
  }

  const { datasetRunItemsFilter } = getProjectDatasetIdDefaultFilter(
    projectId,
    datasetId,
    runIds,
  );

  const baseFilter = datasetRunItemsFilter.apply();

  const scoresFilter = new FilterList([
    new StringFilter({
      clickhouseTable: "scores",
      field: "project_id",
      operator: "=",
      value: projectId,
    }),
  ]);

  const appliedScoresFilter = scoresFilter.apply();

  const userFilters = createFilterFromFilterState(
    filter,
    datasetRunsTableUiColumnDefinitions,
  );
  datasetRunItemsFilter.push(...userFilters);

  const appliedFilter = datasetRunItemsFilter.apply();

  const orderByArray: OrderByState[] = [];
  // Build ORDER BY array - conditionally add dataset_run_created_at ASC for rows
  if (opts.select === "metrics" && orderBy?.column !== "createdAt") {
    orderByArray.push({
      column: "createdAt",
      order: "DESC",
    });
  }
  // Add user ordering if provided
  if (orderBy) {
    orderByArray.push(orderBy);
  }

  const orderByClause = orderByToClickhouseSql(
    orderByArray,
    datasetRunsTableUiColumnDefinitions,
  );

  const scoresCte = `
   WITH scores_aggregated AS (
      SELECT
        dri.dataset_run_id,
        dri.project_id,
        -- For numeric scores, use tuples of (name, avg_value)
        groupArrayIf(
          tuple(s.name, s.avg_value),
          s.data_type IN ('NUMERIC', 'BOOLEAN')
        ) AS scores_avg,
        -- For categorical scores, use name:value format for improved query performance
        groupArrayIf(
          concat(s.name, ':', s.string_value),
          s.data_type = 'CATEGORICAL' AND notEmpty(s.string_value)
        ) AS score_categories
      FROM dataset_run_items_rmt dri
      LEFT JOIN (
        SELECT
          project_id,
          trace_id,
          name,
          data_type,
          string_value,
          avg(value) as avg_value
        FROM scores s FINAL
        WHERE ${appliedScoresFilter.query}
        GROUP BY
          project_id,
          trace_id,
          name,
          data_type,
          string_value
      ) s ON s.project_id = dri.project_id AND s.trace_id = dri.trace_id
      WHERE dri.project_id = {projectId: String}
        AND dri.dataset_id = {datasetId: String}
      GROUP BY dri.dataset_run_id, dri.project_id
    ),
  `;

  const filteredObservationsCte = `
   observations_filtered AS (
      SELECT
        o.id,
        o.trace_id,
        o.project_id,
        o.start_time,
        o.end_time,
        o.total_cost
      FROM observations o
      WHERE o.project_id = {projectId: String}
        AND o.start_time >= (
          SELECT min(dri.dataset_run_created_at) - INTERVAL 1 DAY 
          FROM dataset_run_items_rmt dri 
          WHERE ${baseFilter.query}
        )
        AND o.start_time <= (
          SELECT max(dri.dataset_run_created_at) + INTERVAL 1 DAY 
          FROM dataset_run_items_rmt dri 
          WHERE ${baseFilter.query}
        )
        AND o.trace_id in  (
          SELECT dri.trace_id
          FROM dataset_run_items_rmt dri 
          WHERE ${baseFilter.query}
        )
      ORDER BY o.event_ts DESC
      LIMIT 1 by id, project_id
    ),
  `;

  const datasetRunItemsDedupedCte = `
    dataset_run_items_deduped AS (
      SELECT *
      FROM dataset_run_items_rmt dri
      WHERE ${baseFilter.query}
      ORDER BY dri.created_at DESC
      LIMIT 1 BY dri.project_id, dri.dataset_id, dri.dataset_run_id, dri.dataset_item_id
    ),
  `;

  const traceMetricsCte = `
    trace_metrics AS (
      SELECT
        dri.trace_id,
        dri.project_id,
        dri.dataset_id,
        dri.dataset_run_id,
        dri.dataset_item_id,
        dateDiff('millisecond', min(of.start_time), max(of.end_time)) as latency_ms,
        sum(of.total_cost) as total_cost
      FROM dataset_run_items_deduped dri
      JOIN observations_filtered of ON dri.trace_id = of.trace_id
        AND dri.project_id = of.project_id
      GROUP BY dri.trace_id, dri.project_id, dri.dataset_id, dri.dataset_run_id, dri.dataset_item_id
    ),
  `;

  const datasetRunMetricsCte = `
    dataset_run_metrics AS (
      SELECT
        dri.dataset_run_id as dataset_run_id,
        dri.project_id as project_id,
        dri.dataset_id as dataset_id,
        dri.dataset_run_created_at as dataset_run_created_at,
        dri.dataset_run_name as dataset_run_name,
        dri.dataset_run_description as dataset_run_description,
        dri.dataset_run_metadata as dataset_run_metadata,
        count(DISTINCT dri.project_id, dri.dataset_id, dri.dataset_run_id, dri.dataset_item_id) as count_run_items,

        -- Trace-level metrics (average across traces in this dataset run)
        AVG(CASE WHEN dri.observation_id IS NULL THEN tm.latency_ms ELSE NULL END) / 1000.0 as trace_avg_latency,
        AVG(CASE WHEN dri.observation_id IS NULL THEN tm.total_cost ELSE NULL END) as trace_avg_cost,
        SUM(CASE WHEN dri.observation_id IS NULL THEN tm.total_cost ELSE NULL END) as trace_total_cost,

        -- Observation-level metrics
        AVG(CASE WHEN dri.observation_id IS NOT NULL THEN
          dateDiff('millisecond', of.start_time, of.end_time) / 1000.0
        ELSE NULL END) as obs_avg_latency,
        AVG(CASE WHEN dri.observation_id IS NOT NULL THEN tm.total_cost ELSE NULL END) as obs_avg_cost,
        SUM(CASE WHEN dri.observation_id IS NOT NULL THEN tm.total_cost ELSE NULL END) as obs_total_cost

      FROM dataset_run_items_deduped dri
      LEFT JOIN observations_filtered of ON dri.observation_id = of.id
        AND dri.project_id = of.project_id
        AND dri.trace_id = of.trace_id
      LEFT JOIN trace_metrics tm ON dri.trace_id = tm.trace_id
        AND dri.project_id = tm.project_id
        AND dri.dataset_id = tm.dataset_id
        AND dri.dataset_run_id = tm.dataset_run_id
        AND dri.dataset_item_id = tm.dataset_item_id
      WHERE ${baseFilter.query}
      GROUP BY dri.project_id, dri.dataset_id, dri.dataset_run_id, dri.dataset_run_name, dri.dataset_run_description, dri.dataset_run_metadata, dri.dataset_run_created_at
    )
  `;

  const query = `
    ${scoresCte}
    ${filteredObservationsCte}
    ${datasetRunItemsDedupedCte}
    ${traceMetricsCte}
    ${datasetRunMetricsCte}
    SELECT ${opts.select === "count" ? "" : "DISTINCT"}
      ${select}
    FROM dataset_run_metrics drm
    LEFT JOIN scores_aggregated sa ON drm.dataset_run_id = sa.dataset_run_id AND drm.project_id = sa.project_id
    WHERE drm.project_id = {projectId: String} AND drm.dataset_id = {datasetId: String}
    ${appliedFilter.query ? `AND ${appliedFilter.query}` : ""}
    ${orderByClause}
    ${limit !== undefined && offset !== undefined ? `LIMIT ${limit} OFFSET ${offset}` : ""};`;

  const res = await queryClickhouse<T>({
    query,
    params: {
      projectId,
      datasetId,
      ...(runIds && runIds.length > 0 ? { runIds } : {}),
      ...appliedScoresFilter.params,
      ...baseFilter.params,
      ...appliedFilter.params,
      ...(limit !== undefined && offset !== undefined ? { limit, offset } : {}),
    },
    tags: {
      ...(opts.tags ?? {}),
      feature: "datasets",
      type: "dataset-run-items",
      projectId,
      datasetId,
    },
  });

  return res;
};

export const getDatasetRunsTableMetricsCh = async (
  opts: Omit<DatasetRunsMetricsTableQuery, "select">,
): Promise<DatasetRunsMetrics[]> => {
  // First get the metrics (latency, cost, counts)
  const rows = await getDatasetRunsTableInternal<DatasetRunsMetricsRecordType>({
    ...opts,
    select: "metrics",
    tags: { kind: "list" },
  });

  return rows.map(convertDatasetRunsMetricsRecord);
};

export const getDatasetRunsTableRowsCh = async (
  opts: Omit<DatasetRunsMetricsTableQuery, "select">,
): Promise<DatasetRunsRows[]> => {
  const rows = await getDatasetRunsTableInternal<DatasetRunsRowsRecordType>({
    ...opts,
    select: "rows",
    tags: { kind: "list" },
  });

  return rows.map(convertDatasetRunsRowsRecord);
};

export const getDatasetRunsTableCountCh = async (
  opts: Omit<DatasetRunsMetricsTableQuery, "select">,
): Promise<number> => {
  const rows = await getDatasetRunsTableInternal<{ count: string }>({
    ...opts,
    select: "count",
    tags: { kind: "list" },
  });

  return Number(rows[0]?.count);
};

type GetDatasetRunItemsTableOpts<IncludeIO extends boolean> =
  DatasetRunItemsTableQuery & {
    select: "count" | "rows";
    tags: Record<string, string>;
    includeIO?: IncludeIO;
  };

// Phase 1: Find dataset item IDs or count that satisfy conditions across ALL runs
const getQualifyingDatasetItems = async <T>(opts: {
  select: "count" | "rows";
  projectId: string;
  datasetId: string;
  runIds: string[];
  runFilters: {
    runId: string;
    filters: FilterState;
  }[];
  limit?: number;
  offset?: number;
}): Promise<Array<T>> => {
  const { select, projectId, datasetId, runIds, runFilters, limit, offset } =
    opts;

  if (runIds.length === 0) {
    return [];
  }

  // Build base filter (project + dataset only)
  const { datasetRunItemsFilter: baseDatasetRunItemsFilter } =
    getProjectDatasetIdDefaultFilter(projectId, datasetId);
  const baseFilter = baseDatasetRunItemsFilter.apply();

  // Build run-specific conditions for the intersection query
  const runFilterResults = runFilters.map((runFilter) => {
    const { runId, filters: filterState } = runFilter;

    // Create run ID condition
    const runConditionFilter = new StringFilter({
      clickhouseTable: "dataset_run_items_rmt",
      field: "dataset_run_id",
      operator: "=",
      value: runId,
    });

    // Create user filters for this run
    const userFilters = createFilterFromFilterState(
      filterState,
      datasetRunItemsTableUiColumnDefinitions,
    );

    // Combine run condition with user filters using AND and apply immediately
    const runFilterList = new FilterList([runConditionFilter, ...userFilters]);
    return runFilterList.apply();
  });

  // add empty filters for the runs that have no filters
  runIds.forEach((runId) => {
    if (runFilters.find((runFilter) => runFilter.runId === runId)) {
      return;
    }
    // Create run ID condition
    const runConditionFilter = new FilterList([
      new StringFilter({
        clickhouseTable: "dataset_run_items_rmt",
        field: "dataset_run_id",
        operator: "=",
        value: runId,
      }),
    ]);
    runFilterResults.push(runConditionFilter.apply());
  });

  const combinedQuery = `(${runFilterResults.map((result) => `(${result.query})`).join(" OR ")})`;

  const intersectionQuery =
    runFilters.length > 0
      ? `HAVING COUNT(DISTINCT dataset_run_id) = {totalRunCount: UInt32}`
      : "";

  // Check if any run has score filters for CTE
  const hasScoresFilter = runFilters
    .flatMap((f) => f.filters)
    .some((f) => f.column.toLowerCase().includes("score"));

  // Build scores filter
  const scoresFilter = new FilterList([
    new StringFilter({
      clickhouseTable: "scores",
      field: "project_id",
      operator: "=",
      value: projectId,
    }),
  ]);
  const appliedScoresFilter = scoresFilter.apply();

  const selectString =
    select === "count"
      ? "COUNT(DISTINCT dataset_item_id) as count"
      : "dataset_item_id";

  // Build the intersection query
  const scoresCte = hasScoresFilter
    ? `
  WITH scores_aggregated AS (
     SELECT
       dri.dataset_run_id,
       dri.project_id,
       dri.trace_id,
       -- For numeric scores, use tuples of (name, avg_value)
       groupArrayIf(
         tuple(s.name, s.avg_value),
         s.data_type IN ('NUMERIC', 'BOOLEAN')
       ) AS scores_avg,
       -- For categorical scores, use name:value format for improved query performance
       groupArrayIf(
         concat(s.name, ':', s.string_value),
         s.data_type = 'CATEGORICAL' AND notEmpty(s.string_value)
       ) AS score_categories
     FROM dataset_run_items_rmt dri
     LEFT JOIN (
       SELECT
         project_id,
         trace_id,
         name,
         data_type,
         string_value,
         avg(value) as avg_value
       FROM scores s FINAL
       WHERE ${appliedScoresFilter.query}
       GROUP BY
         project_id,
         trace_id,
         name,
         data_type,
         string_value
     ) s ON s.project_id = dri.project_id AND s.trace_id = dri.trace_id
     WHERE ${baseFilter.query}
     GROUP BY dri.project_id, dri.dataset_id, dri.dataset_run_id, dri.trace_id
   ),
   `
    : "WITH ";

  const query = `
    ${scoresCte}
    run_qualified_items AS (
      SELECT DISTINCT dri.dataset_item_id, dri.dataset_run_id
      FROM dataset_run_items_rmt dri
      ${hasScoresFilter ? `LEFT JOIN scores_aggregated sa ON dri.dataset_run_id = sa.dataset_run_id AND dri.project_id = sa.project_id AND dri.trace_id = sa.trace_id` : ""}
      WHERE ${baseFilter.query}
      AND ${combinedQuery}
    ),
    intersection_items AS (
      SELECT dataset_item_id
      FROM run_qualified_items
      GROUP BY dataset_item_id
      ${intersectionQuery}
    )
    SELECT 
      ${selectString}
    FROM intersection_items
    ${select === "count" ? "" : "ORDER BY dataset_item_id -- for consistent pagination"}
    ${limit !== undefined && offset !== undefined ? `LIMIT ${limit} OFFSET ${offset}` : ""};`;

  const res = await queryClickhouse<T>({
    query,
    params: {
      ...baseFilter.params,
      ...(hasScoresFilter ? appliedScoresFilter.params : {}),
      totalRunCount: runIds.length,
      ...runFilterResults.reduce((acc, result) => {
        return { ...acc, ...result.params };
      }, {}),
      ...(limit !== undefined && offset !== undefined ? { limit, offset } : {}),
    },
    tags: {
      feature: "datasets",
      type: "dataset-run-items",
      projectId,
      datasetId,
    },
  });

  return res;
};

const getDatasetRunItemsTableInternal = async <
  T,
  IncludeIO extends boolean = true,
>(
  opts: GetDatasetRunItemsTableOpts<IncludeIO>,
): Promise<Array<T>> => {
  const { projectId, datasetId, filter, orderBy, limit, offset, includeIO } =
    opts;

  let selectString = "";

  switch (opts.select) {
    case "count":
      selectString =
        "count(DISTINCT dri.project_id, dri.dataset_id, dri.dataset_run_id, dri.dataset_item_id) as count";
      break;
    case "rows":
      selectString = `
      dri.id as id, 
      dri.project_id as project_id, 
      dri.trace_id as trace_id, 
      dri.observation_id as observation_id, 
      dri.dataset_id as dataset_id,
      dri.dataset_run_id as dataset_run_id, 
      dri.dataset_item_id as dataset_item_id, 
      dri.error as error,
      dri.created_at as created_at, 
      dri.updated_at as updated_at,
      dri.dataset_run_name as dataset_run_name,
      dri.dataset_run_description as dataset_run_description,
      dri.dataset_run_created_at as dataset_run_created_at,
      dri.dataset_item_version as dataset_item_version,
      ${includeIO ? "dri.dataset_run_metadata as dataset_run_metadata, " : ""}
      ${includeIO ? "dri.dataset_item_input as dataset_item_input, " : ""}
      ${includeIO ? "dri.dataset_item_expected_output as dataset_item_expected_output, " : ""}
      ${includeIO ? "dri.dataset_item_metadata as dataset_item_metadata, " : ""}
      dri.is_deleted as is_deleted,
      dri.event_ts as event_ts`;
      break;
    default:
      throw new Error(`Unknown select type: ${opts.select}`);
  }

  const { datasetRunItemsFilter } = getProjectDatasetIdDefaultFilter(
    projectId,
    datasetId,
  );

  datasetRunItemsFilter.push(
    ...createFilterFromFilterState(
      filter,
      datasetRunItemsTableUiColumnDefinitions,
    ),
  );
  const appliedFilter = datasetRunItemsFilter.apply();

  const scoresFilter = new FilterList([
    new StringFilter({
      clickhouseTable: "scores",
      field: "project_id",
      operator: "=",
      value: projectId,
    }),
  ]);

  const hasScoresFilter = filter.some((f) =>
    f.column.toLowerCase().includes("score"),
  );

  const appliedScoresFilter = scoresFilter.apply();

  // Build ORDER BY array - conditionally add event_ts DESC for rows
  const orderByArray: OrderByState[] = [];

  // Add user ordering if provided
  if (orderBy) {
    if (Array.isArray(orderBy)) {
      orderByArray.push(...orderBy);
    } else {
      orderByArray.push(orderBy);
    }
  }

  // Add event_ts DESC for row queries (for deduplication)
  if (opts.select === "rows") {
    orderByArray.push({
      column: "eventTs",
      order: "DESC",
    });
  }

  const orderByClause = orderByToClickhouseSql(
    orderByArray,
    datasetRunItemsTableUiColumnDefinitions,
  );

  const scoresCte = `
  WITH scores_aggregated AS (
     SELECT
       dri.dataset_run_id,
       dri.project_id,
       dri.trace_id,
       -- For numeric scores, use tuples of (name, avg_value)
       groupArrayIf(
         tuple(s.name, s.avg_value),
         s.data_type IN ('NUMERIC', 'BOOLEAN')
       ) AS scores_avg,
       -- For categorical scores, use name:value format for improved query performance
       groupArrayIf(
         concat(s.name, ':', s.string_value),
         s.data_type = 'CATEGORICAL' AND notEmpty(s.string_value)
       ) AS score_categories
     FROM dataset_run_items_rmt dri
     LEFT JOIN (
       SELECT
         project_id,
         trace_id,
         name,
         data_type,
         string_value,
         avg(value) as avg_value
       FROM scores s FINAL
       WHERE ${appliedScoresFilter.query}
       GROUP BY
         project_id,
         trace_id,
         name,
         data_type,
         string_value
     ) s ON s.project_id = dri.project_id AND s.trace_id = dri.trace_id
     WHERE dri.project_id = {projectId: String}
       ${datasetId ? "AND dri.dataset_id = {datasetId: String}" : ""}
     GROUP BY dri.dataset_run_id, dri.project_id, dri.trace_id
   )
 `;

  const query =
    opts.select === "rows"
      ? `
    ${scoresCte}
    SELECT *
    FROM (
      SELECT
        ${selectString}
      FROM dataset_run_items_rmt dri 
      ${hasScoresFilter ? `LEFT JOIN scores_aggregated sa ON dri.dataset_run_id = sa.dataset_run_id AND dri.project_id = sa.project_id AND dri.trace_id = sa.trace_id` : ""}
      WHERE ${appliedFilter.query}
      ${orderByClause}
      LIMIT 1 BY dri.project_id, dri.dataset_id, dri.dataset_run_id, dri.dataset_item_id
    ) AS deduplicated
    ${limit !== undefined && offset !== undefined ? `LIMIT ${limit} OFFSET ${offset}` : ""};`
      : `
    ${scoresCte}
    SELECT
      ${selectString}
    FROM dataset_run_items_rmt dri 
    ${hasScoresFilter ? `LEFT JOIN scores_aggregated sa ON dri.dataset_run_id = sa.dataset_run_id AND dri.project_id = sa.project_id AND dri.trace_id = sa.trace_id` : ""}
    WHERE ${appliedFilter.query};`;

  const res = await queryClickhouse<T>({
    query,
    params: {
      ...appliedFilter.params,
      ...appliedScoresFilter.params,
      ...(limit !== undefined && offset !== undefined ? { limit, offset } : {}),
      ...(datasetId ? { datasetId } : {}),
      projectId,
    },
    tags: {
      ...(opts.tags ?? {}),
      feature: "datasets",
      type: "dataset-run-items",
      projectId,
      ...(datasetId ? { datasetId } : {}),
    },
    clickhouseConfigs: opts.clickhouseConfigs,
  });

  return res;
};

export const getDatasetRunItemsCh = async (
  opts: DatasetRunItemsTableQuery,
): Promise<DatasetRunItemDomain[]> => {
  const rows = await getDatasetRunItemsTableInternal<DatasetRunItemRecord>({
    ...opts,
    select: "rows",
    tags: { kind: "list" },
  });

  return rows.map((row) => convertDatasetRunItemClickhouseToDomain(row));
};

export const getDatasetRunItemsByDatasetIdCh = async (
  opts: DatasetRunItemsByDatasetIdQuery,
): Promise<DatasetRunItemDomain[]> => {
  const rows = await getDatasetRunItemsTableInternal<DatasetRunItemRecord>({
    ...opts,
    select: "rows",
    tags: { kind: "list" },
  });

  return rows.map((row) => convertDatasetRunItemClickhouseToDomain(row));
};

export const getDatasetItemsWithRunDataCount = async (
  opts: DatasetItemsWithRunDataCountQuery,
): Promise<number> => {
  const { projectId, datasetId, runIds, filterByRun } = opts;

  const rows = await getQualifyingDatasetItems<{ count: string }>({
    select: "count",
    projectId,
    datasetId,
    runIds,
    runFilters: filterByRun,
  });

  return Number(rows[0]?.count);
};

export const getDatasetItemIdsWithRunData = async (
  opts: DatasetItemIdsWithRunDataQuery,
): Promise<string[]> => {
  const rows = await getQualifyingDatasetItems<{ dataset_item_id: string }>({
    select: "rows",
    runFilters: opts.filterByRun,
    ...opts,
  });

  return rows.map((row) => row.dataset_item_id);
};

export const getDatasetRunItemsWithoutIOByItemIds = async (
  opts: DatasetRunItemsByItemIdsWithoutIOQuery,
): Promise<DatasetRunItemDomain<false>[]> => {
  // Step 1: Get DRI data matching [datasetId, runId, datasetItemId]
  const { datasetItemIds, runIds, ...rest } = opts;

  const filter: FilterState = [
    {
      column: "datasetItemId",
      operator: "any of",
      value: datasetItemIds,
      type: "stringOptions" as const,
    },
    {
      column: "datasetRunId",
      operator: "any of",
      value: runIds,
      type: "stringOptions" as const,
    },
  ];
  const rows = await getDatasetRunItemsTableInternal<
    DatasetRunItemRecord<false>,
    false
  >({
    ...rest,
    filter,
    select: "rows",
    tags: { kind: "list" },
  });

  // Step 2: Convert to domain
  return rows.map((row) => convertDatasetRunItemClickhouseToDomain(row));
};

export const getDatasetItemIdsByTraceIdCh = async (
  opts: DatasetItemIdsByTraceIdQuery,
): Promise<
  { id: string; datasetId: string; observationId: string | null }[]
> => {
  const { projectId, traceId, filter } = opts;

  const datasetRunItemsFilter = new FilterList([
    new StringFilter({
      clickhouseTable: "dataset_run_items_rmt",
      field: "project_id",
      operator: "=",
      value: projectId,
    }),
    new StringFilter({
      clickhouseTable: "dataset_run_items_rmt",
      field: "trace_id",
      operator: "=",
      value: traceId,
    }),
  ]);

  datasetRunItemsFilter.push(
    ...createFilterFromFilterState(
      filter,
      datasetRunItemsTableUiColumnDefinitions,
    ),
  );
  const appliedFilter = datasetRunItemsFilter.apply();

  const query = `
  SELECT
    dri.dataset_item_id as dataset_item_id,
    dri.observation_id as observation_id,
    dri.dataset_id as dataset_id
  FROM dataset_run_items_rmt dri 
  WHERE ${appliedFilter.query}
  LIMIT 1 BY dri.project_id, dri.dataset_id, dri.dataset_run_id, dri.dataset_item_id;`;

  const res = await queryClickhouse<{
    dataset_item_id: string;
    observation_id: string | null;
    dataset_id: string;
  }>({
    query,
    params: {
      ...appliedFilter.params,
    },
    tags: {
      feature: "datasets",
      type: "dataset-run-items",
      projectId,
      traceId,
    },
  });

  return res.map((runItem) => {
    return {
      id: runItem.dataset_item_id,
      observationId: runItem.observation_id,
      datasetId: runItem.dataset_id,
    };
  });
};

export const getDatasetRunItemsCountCh = async (
  opts: DatasetRunItemsTableQuery,
): Promise<number> => {
  const rows = await getDatasetRunItemsTableInternal<{ count: string }>({
    ...opts,
    select: "count",
    tags: { kind: "list" },
  });

  return Number(rows[0]?.count);
};

export const getDatasetRunItemsCountByDatasetIdCh = async (
  opts: DatasetRunItemsByDatasetIdQuery,
): Promise<number> => {
  const rows = await getDatasetRunItemsTableInternal<{ count: string }>({
    ...opts,
    select: "count",
    tags: { kind: "list" },
  });

  return Number(rows[0]?.count);
};

export const hasAnyDatasetRunItem = async (
  projectId: string,
): Promise<boolean> => {
  const query = `
    SELECT 1
    FROM dataset_run_items_rmt
    WHERE project_id = {projectId: String}
    LIMIT 1
  `;

  const rows = await queryClickhouse<{ 1: number }>({
    query,
    params: { projectId },
    tags: {
      feature: "datasets",
      type: "dataset-run-items",
      kind: "hasAny",
      projectId,
    },
  });

  return rows.length > 0;
};

export const deleteDatasetRunItemsByProjectId = async (
  projectId: string,
): Promise<boolean> => {
  const hasData = await hasAnyDatasetRunItem(projectId);
  if (!hasData) {
    return false;
  }

  const query = `
    DELETE FROM dataset_run_items_rmt
    WHERE project_id = {projectId: String};
  `;
  await commandClickhouse({
    query,
    params: { projectId },
    clickhouseConfigs: {
      request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
    },
    tags: {
      feature: "datasets",
      type: "dataset-run-items",
      kind: "delete",
      projectId,
    },
  });

  return true;
};

export const deleteDatasetRunItemsByDatasetId = async ({
  projectId,
  datasetId,
}: {
  projectId: string;
  datasetId: string;
}) => {
  const query = `
  DELETE FROM dataset_run_items_rmt
  WHERE project_id = {projectId: String}
  AND dataset_id = {datasetId: String}
`;

  await commandClickhouse({
    query,
    params: {
      projectId,
      datasetId,
    },
    clickhouseConfigs: {
      request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
    },
    tags: {
      feature: "datasets",
      type: "dataset-run-items",
      kind: "delete",
      projectId,
    },
  });
};

export const deleteDatasetRunItemsByDatasetRunIds = async ({
  projectId,
  datasetRunIds,
  datasetId,
}: {
  projectId: string;
  datasetRunIds: string[];
  datasetId: string;
}) => {
  const query = `
    DELETE FROM dataset_run_items_rmt
    WHERE project_id = {projectId: String}
    AND dataset_id = {datasetId: String}
    AND dataset_run_id IN ({datasetRunIds: Array(String)})
  `;

  await commandClickhouse({
    query,
    params: {
      projectId,
      datasetRunIds,
      datasetId,
    },
    clickhouseConfigs: {
      request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
    },
    tags: {
      feature: "datasets",
      type: "dataset-run-items",
      kind: "delete",
      projectId,
    },
  });
};

export const getDatasetRunItemCountsByProjectInCreationInterval = async ({
  start,
  end,
}: {
  start: Date;
  end: Date;
}) => {
  const query = `
  SELECT
    project_id,
    count(*) as count
  FROM dataset_run_items_rmt
  WHERE created_at >= {start: DateTime64(3)}
  AND created_at < {end: DateTime64(3)}
  GROUP BY project_id
`;

  const rows = await queryClickhouse<{ project_id: string; count: string }>({
    query,
    params: {
      start: convertDateToClickhouseDateTime(start),
      end: convertDateToClickhouseDateTime(end),
    },
    tags: {
      feature: "datasets",
      type: "dataset-run-items",
      kind: "analytic",
      operation_name: "getDatasetRunItemCountsByProjectInCreationInterval",
    },
  });

  return rows.map((row) => ({
    projectId: row.project_id,
    count: Number(row.count),
  }));
};
