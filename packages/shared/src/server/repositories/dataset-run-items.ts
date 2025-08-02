import { DatasetRunItemDomain } from "../../domain/dataset-run-items";
import { type OrderByState } from "../../interfaces/orderBy";
import { datasetRunItemsTableUiColumnDefinitions } from "../../tableDefinitions";
import { FilterState } from "../../types";
import {
  createFilterFromFilterState,
  FilterList,
  orderByToClickhouseSql,
  StringFilter,
} from "../queries";
import {
  parseClickhouseUTCDateTimeFormat,
  queryClickhouse,
} from "./clickhouse";
import { convertDatasetRunItemClickhouseToDomain } from "./dataset-run-items-converters";
import { DatasetRunItemRecordReadType } from "./definitions";
import { env } from "../../env";
import { commandClickhouse } from "./clickhouse";
import Decimal from "decimal.js";

type DatasetRunItemsTableQuery = {
  projectId: string;
  datasetId: string;
  filter: FilterState;
  orderBy?: OrderByState;
  limit?: number;
  offset?: number;
};

type DatasetRunsMetricsTableQuery = {
  projectId: string;
  datasetId: string;
  orderBy?: OrderByState;
  limit?: number;
  offset?: number;
};

type DatasetRunsMetrics = {
  id: string;
  projectId: string;
  createdAt: Date;
  datasetId: string;
  countRunItems: number;
  avgTotalCost: Decimal;
  avgLatency: number;
  name: string;
};

type DatasetRunsMetricsRecordType = {
  dataset_run_id: string;
  project_id: string;
  dataset_run_created_at: string;
  dataset_id: string;
  count_run_items: number;
  avg_latency_seconds: number;
  avg_total_cost: number;
  dataset_run_name: string;
};

const convertDatasetRunsMetricsRecord = (
  record: DatasetRunsMetricsRecordType,
): DatasetRunsMetrics => {
  return {
    id: record.dataset_run_id,
    projectId: record.project_id,
    createdAt: parseClickhouseUTCDateTimeFormat(record.dataset_run_created_at),
    datasetId: record.dataset_id,
    countRunItems: record.count_run_items,
    avgTotalCost: record.avg_total_cost
      ? new Decimal(record.avg_total_cost)
      : new Decimal(0),
    avgLatency: record.avg_latency_seconds ?? 0,
    name: record.dataset_run_name,
  };
};

const getProjectDatasetIdDefaultFilter = (
  projectId: string,
  datasetId: string,
) => {
  return {
    datasetRunItemsFilter: new FilterList([
      new StringFilter({
        clickhouseTable: "dataset_run_items",
        field: "project_id",
        operator: "=",
        value: projectId,
      }),
      new StringFilter({
        clickhouseTable: "dataset_run_items",
        field: "dataset_id",
        operator: "=",
        value: datasetId,
      }),
    ]),
  };
};

const getDatasetRunsTableInternal = async <T>(
  opts: DatasetRunsMetricsTableQuery & {
    tags: Record<string, string>;
  },
): Promise<Array<T>> => {
  const { projectId, datasetId, orderBy, limit, offset } = opts;

  const { datasetRunItemsFilter } = getProjectDatasetIdDefaultFilter(
    projectId,
    datasetId,
  );
  const appliedFilter = datasetRunItemsFilter.apply();

  // Build ORDER BY array - conditionally add event_ts DESC for rows
  const orderByArray: OrderByState[] = [];

  // Add user ordering if provided
  if (orderBy) {
    orderByArray.push(orderBy);
  }

  const orderByClause = orderByToClickhouseSql(
    orderByArray,
    datasetRunItemsTableUiColumnDefinitions,
  );

  const query = `
    WITH observations_filtered AS (
      SELECT
        o.id,
        o.trace_id,
        o.project_id,
        o.start_time,
        o.end_time,
        o.total_cost
      FROM observations o FINAL
      WHERE o.project_id = {projectId: String}
        AND o.start_time >= (
          SELECT min(dri.dataset_run_created_at) - INTERVAL 1 DAY 
          FROM dataset_run_items dri 
          WHERE dri.project_id = {projectId: String} 
            AND dri.dataset_id = {datasetId: String}
        )
        AND o.start_time <= (
          SELECT max(dri.dataset_run_created_at) + INTERVAL 1 DAY 
          FROM dataset_run_items dri 
          WHERE dri.project_id = {projectId: String} 
            AND dri.dataset_id = {datasetId: String}
        )
    ),
    traces_aggregated AS (
      SELECT
        of.trace_id,
        of.project_id,
        dateDiff('millisecond', min(of.start_time), max(of.end_time)) as latency_ms,
        sum(of.total_cost) as total_cost
      FROM observations_filtered of
      JOIN dataset_run_items dri ON dri.trace_id = of.trace_id 
        AND dri.project_id = of.project_id
        AND dri.observation_id IS NULL  -- Only for trace-level dataset run items
      WHERE dri.dataset_id = {datasetId: String}
      GROUP BY of.trace_id, of.project_id
    ),
    observations_direct AS (
      SELECT
        dri.observation_id,
        dri.project_id,
        dri.trace_id,
        of.total_cost,
        dateDiff('millisecond', of.start_time, of.end_time) as latency_ms
      FROM dataset_run_items dri
      JOIN observations_filtered of ON dri.observation_id = of.id
        AND dri.project_id = of.project_id
        AND dri.trace_id = of.trace_id
      WHERE dri.dataset_id = {datasetId: String}
        AND dri.observation_id IS NOT NULL  -- Only for observation-level dataset run items
    )
    SELECT DISTINCT
      dri.dataset_run_id as dataset_run_id,
      dri.project_id as project_id,
      dri.dataset_id as dataset_id,
      dri.dataset_run_created_at as dataset_run_created_at,
      any(dri.dataset_run_name) as dataset_run_name,
      count(DISTINCT dri.project_id, dri.dataset_id, dri.dataset_run_id, dri.dataset_item_id) as count_run_items,
      
      -- Latency metrics (priority: observation > trace)
      AVG(CASE
        WHEN dri.observation_id IS NOT NULL AND od.latency_ms IS NOT NULL
        THEN od.latency_ms / 1000.0
        ELSE COALESCE(ta.latency_ms / 1000.0, 0)
      END) as avg_latency_seconds,
      
      -- Cost metrics (priority: observation > trace)  
      AVG(CASE
        WHEN dri.observation_id IS NOT NULL AND od.total_cost IS NOT NULL
        THEN od.total_cost
        ELSE COALESCE(ta.total_cost, 0)
      END) as avg_total_cost
    FROM dataset_run_items dri 
    LEFT JOIN traces_aggregated ta
      ON dri.trace_id = ta.trace_id
      AND dri.project_id = ta.project_id
    LEFT JOIN observations_direct od
      ON dri.observation_id = od.observation_id
      AND dri.project_id = od.project_id
      AND dri.trace_id = od.trace_id
    WHERE ${appliedFilter.query}
    GROUP BY dri.project_id, dri.dataset_id, dri.dataset_run_id, dri.dataset_run_created_at
    ORDER BY dri.dataset_run_created_at DESC
    ${orderByClause}
    ${limit !== undefined && offset !== undefined ? `LIMIT ${limit} OFFSET ${offset}` : ""};`;

  const res = await queryClickhouse<T>({
    query,
    params: {
      projectId,
      datasetId,
      ...appliedFilter.params,
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
  opts: DatasetRunsMetricsTableQuery,
): Promise<DatasetRunsMetrics[]> => {
  // First get the metrics (latency, cost, counts)
  const rows = await getDatasetRunsTableInternal<DatasetRunsMetricsRecordType>({
    ...opts,
    tags: { kind: "list" },
  });

  return rows.map(convertDatasetRunsMetricsRecord);
};

const getDatasetRunItemsTableInternal = async <T>(
  opts: DatasetRunItemsTableQuery & {
    select: "count" | "rows";
    tags: Record<string, string>;
  },
): Promise<Array<T>> => {
  const { projectId, datasetId, filter, orderBy, limit, offset } = opts;

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
      dri.dataset_run_metadata as dataset_run_metadata,
      dri.dataset_run_created_at as dataset_run_created_at,
      dri.dataset_item_input as dataset_item_input,
      dri.dataset_item_expected_output as dataset_item_expected_output,
      dri.dataset_item_metadata as dataset_item_metadata,
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

  // Build ORDER BY array - conditionally add event_ts DESC for rows
  const orderByArray: OrderByState[] = [];

  // Add user ordering if provided
  if (orderBy) {
    orderByArray.push(orderBy);
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

  const query = `
    SELECT
      ${selectString}
    FROM dataset_run_items dri 
    WHERE ${appliedFilter.query}
    ${orderByClause}
    ${opts.select === "rows" ? "LIMIT 1 BY dri.project_id, dri.dataset_id, dri.dataset_run_id, dri.dataset_item_id" : ""}
    ${limit !== undefined && offset !== undefined ? `LIMIT ${limit} OFFSET ${offset}` : ""};`;

  const res = await queryClickhouse<T>({
    query,
    params: {
      ...appliedFilter.params,
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

export const getDatasetRunItemsByDatasetIdCh = async (
  opts: DatasetRunItemsTableQuery,
): Promise<DatasetRunItemDomain[]> => {
  const rows =
    await getDatasetRunItemsTableInternal<DatasetRunItemRecordReadType>({
      ...opts,
      select: "rows",
      tags: { kind: "list" },
    });

  return rows.map(convertDatasetRunItemClickhouseToDomain);
};

export const getDatasetRunItemsCountByDatasetIdCh = async (
  opts: DatasetRunItemsTableQuery,
): Promise<number> => {
  const rows = await getDatasetRunItemsTableInternal<{ count: string }>({
    ...opts,
    select: "count",
    tags: { kind: "list" },
  });

  return Number(rows[0]?.count);
};

export const deleteDatasetRunItemsByProjectId = async ({
  projectId,
}: {
  projectId: string;
}) => {
  const query = `
      DELETE FROM dataset_run_items
      WHERE project_id = {projectId: String};
    `;
  await commandClickhouse({
    query: query,
    params: {
      projectId,
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

export const deleteDatasetRunItemsByDatasetId = async ({
  projectId,
  datasetId,
}: {
  projectId: string;
  datasetId: string;
}) => {
  const query = `
  DELETE FROM dataset_run_items
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
    DELETE FROM dataset_run_items
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
