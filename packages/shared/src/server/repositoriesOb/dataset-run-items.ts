/**
 * Logic mirrors repositories/dataset-run-items.ts (ClickHouse); syntax adapted for OceanBase.
 */
import { DatasetRunItemDomain } from "../../domain/dataset-run-items";
import { type OrderByState } from "../../interfaces/orderBy";
import { datasetRunItemsTableUiColumnDefinitions } from "../tableMappings";
import { FilterState } from "../../types";
import {
  createFilterFromFilterState,
  FilterList,
  orderByToClickhouseSql,
  StringFilter,
} from "../queries";
import { DatabaseAdapterFactory } from "../database";
import { convertDatasetRunItemClickhouseToDomain } from "../repositories/dataset-run-items-converters";
import { DatasetRunItemRecordReadType } from "../repositories/definitions";
import Decimal from "decimal.js";
import { convertDateToDateTime } from "../database";
import { convertFilterParamsToPositional } from "../database/oceanbase-filter-helper";

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
};

type DatasetRunItemsByDatasetIdQuery = Omit<
  DatasetRunItemsTableQuery,
  "datasetId"
> & {
  datasetId: string;
};

type DatasetRunsMetricsTableQuery = {
  projectId: string;
  datasetId: string;
  orderBy?: OrderByState;
  limit?: number;
  offset?: number;
};

export type DatasetRunsMetrics = {
  id: string;
  projectId: string;
  createdAt: Date;
  datasetId: string;
  countRunItems: number;
  avgTotalCost: Decimal;
  avgLatency: number;
};

type DatasetRunsMetricsRecordType = {
  dataset_run_id: string;
  project_id: string;
  dataset_run_created_at: string;
  dataset_id: string;
  count_run_items: number;
  avg_latency_seconds: number;
  avg_total_cost: number;
};

const convertDatasetRunsMetricsRecord = (
  record: DatasetRunsMetricsRecordType,
): DatasetRunsMetrics => {
  const adapter = DatabaseAdapterFactory.getInstance();
  return {
    id: record.dataset_run_id,
    projectId: record.project_id,
    createdAt: adapter.parseUTCDateTimeFormat(record.dataset_run_created_at),
    datasetId: record.dataset_id,
    countRunItems: record.count_run_items,
    avgTotalCost: record.avg_total_cost
      ? new Decimal(record.avg_total_cost)
      : new Decimal(0),
    avgLatency: record.avg_latency_seconds ?? 0,
  };
};

const getProjectDatasetIdDefaultFilter = (
  projectId: string,
  datasetId?: string,
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

  let orderByClause = orderByToClickhouseSql(
    orderByArray,
    datasetRunItemsTableUiColumnDefinitions,
  );

  // Convert orderByClause for OceanBase (remove table aliases, convert quotes to backticks)
  if (orderByClause) {
    // Remove table aliases like "dri." from column references
    orderByClause = orderByClause.replace(/dri\./g, "");
    // Convert double quotes to backticks for OceanBase/MySQL
    orderByClause = orderByClause.replace(/"([^"]+)"/g, "`$1`");
  }

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

  // Add table aliases to columns in filterQuery to avoid ambiguity
  // This handles cases where filterQuery contains columns without table aliases
  // Since the main query has multiple tables (dri, ta, od), we need to prefix columns with dri.
  if (filterQuery) {
    const columnMap: Record<string, string> = {
      project_id: "dri.project_id",
      dataset_id: "dri.dataset_id",
      dataset_run_id: "dri.dataset_run_id",
      dataset_item_id: "dri.dataset_item_id",
      trace_id: "dri.trace_id",
      observation_id: "dri.observation_id",
      created_at: "dri.dataset_run_created_at",
      updated_at: "dri.updated_at",
    };

    // Only replace if the column name is not already prefixed with a table alias
    for (const [col, aliasedCol] of Object.entries(columnMap)) {
      // Match column names that are not already prefixed (not like "dri.project_id" or "ta.project_id")
      const pattern = new RegExp(`\\b${col}\\b(?![a-zA-Z_])`, "g");
      filterQuery = filterQuery.replace(pattern, aliasedCol);
    }
  }

  const query = `
    WITH observations_filtered AS (
      SELECT
        o.id,
        o.trace_id,
        o.project_id,
        o.start_time,
        o.end_time,
        o.total_cost
      FROM observations o
      WHERE o.project_id = ?
        AND o.start_time >= (
          SELECT DATE_SUB(MIN(dri.dataset_run_created_at), INTERVAL 1 DAY)
          FROM dataset_run_items_rmt dri 
          WHERE dri.project_id = ? 
            AND dri.dataset_id = ?
        )
        AND o.start_time <= (
          SELECT DATE_ADD(MAX(dri.dataset_run_created_at), INTERVAL 1 DAY)
          FROM dataset_run_items_rmt dri 
          WHERE dri.project_id = ? 
            AND dri.dataset_id = ?
        )
    ),
    traces_aggregated AS (
      SELECT
        of.trace_id,
        of.project_id,
        TIMESTAMPDIFF(MICROSECOND, MIN(of.start_time), MAX(of.end_time)) / 1000 as latency_ms,
        SUM(of.total_cost) as total_cost
      FROM observations_filtered of
      JOIN dataset_run_items_rmt dri ON dri.trace_id = of.trace_id 
        AND dri.project_id = of.project_id
        AND dri.observation_id IS NULL  -- Only for trace-level dataset run items
      WHERE dri.dataset_id = ?
      GROUP BY of.trace_id, of.project_id
    ),
    observations_direct AS (
      SELECT
        dri.observation_id,
        dri.project_id,
        dri.trace_id,
        of.total_cost,
        TIMESTAMPDIFF(MICROSECOND, of.start_time, of.end_time) / 1000 as latency_ms
      FROM dataset_run_items_rmt dri
      JOIN observations_filtered of ON dri.observation_id = of.id
        AND dri.project_id = of.project_id
        AND dri.trace_id = of.trace_id
      WHERE dri.dataset_id = ?
        AND dri.observation_id IS NOT NULL  -- Only for observation-level dataset run items
    )
    SELECT DISTINCT
      dri.dataset_run_id as dataset_run_id,
      dri.project_id as project_id,
      dri.dataset_id as dataset_id,
      dri.dataset_run_created_at as dataset_run_created_at,
      COUNT(DISTINCT CONCAT(dri.project_id, '|', dri.dataset_id, '|', dri.dataset_run_id, '|', dri.dataset_item_id)) as count_run_items,
      
      -- Latency metrics (priority: trace > observation - matching old PostgreSQL behavior)
      CASE
        WHEN AVG(CASE WHEN dri.observation_id IS NULL THEN ta.latency_ms / 1000.0 ELSE NULL END) IS NOT NULL
        THEN AVG(CASE WHEN dri.observation_id IS NULL THEN ta.latency_ms / 1000.0 ELSE NULL END)
        ELSE AVG(CASE WHEN dri.observation_id IS NOT NULL THEN od.latency_ms / 1000.0 ELSE NULL END)
      END as avg_latency_seconds,
      
      -- Cost metrics (priority: trace > observation - matching old PostgreSQL behavior)  
      CASE
        WHEN AVG(CASE WHEN dri.observation_id IS NULL THEN ta.total_cost ELSE NULL END) IS NOT NULL
        THEN AVG(CASE WHEN dri.observation_id IS NULL THEN ta.total_cost ELSE NULL END)
        ELSE COALESCE(AVG(CASE WHEN dri.observation_id IS NOT NULL THEN od.total_cost ELSE NULL END), 0)
      END as avg_total_cost
    FROM dataset_run_items_rmt dri 
    LEFT JOIN traces_aggregated ta
      ON dri.trace_id = ta.trace_id
      AND dri.project_id = ta.project_id
    LEFT JOIN observations_direct od
      ON dri.observation_id = od.observation_id
      AND dri.project_id = od.project_id
      AND dri.trace_id = od.trace_id
    WHERE ${filterQuery || "1=1"}
    GROUP BY dri.project_id, dri.dataset_id, dri.dataset_run_id, dri.dataset_run_created_at
    ${orderByClause || "ORDER BY dri.dataset_run_created_at DESC"}
    ${limit !== undefined && offset !== undefined ? `LIMIT ${limit} OFFSET ${offset}` : ""};`;

  const adapter = DatabaseAdapterFactory.getInstance();
  const params: unknown[] = [
    projectId, // observations_filtered WHERE
    projectId, // first subquery WHERE
    datasetId, // first subquery WHERE
    projectId, // second subquery WHERE
    datasetId, // second subquery WHERE
    datasetId, // traces_aggregated WHERE
    datasetId, // observations_direct WHERE
    ...filterParams, // main WHERE filter
  ];
  const res = await adapter.queryWithOptions<T>({
    query,
    params,
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
        "COUNT(DISTINCT CONCAT(dri.project_id, '|', dri.dataset_id, '|', dri.dataset_run_id, '|', dri.dataset_item_id)) as count";
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
      dri.dataset_item_version as dataset_item_version,
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

  let orderByClause = orderByToClickhouseSql(
    orderByArray,
    datasetRunItemsTableUiColumnDefinitions,
  );

  // For rows query, convert orderByClause to work with outer query (no table alias, use backticks)
  if (opts.select === "rows" && orderByClause) {
    // Remove table aliases like "dri." from column references
    orderByClause = orderByClause.replace(/dri\./g, "");
    // Convert double quotes to backticks for OceanBase/MySQL
    orderByClause = orderByClause.replace(/"([^"]+)"/g, "`$1`");
    // Ensure all column names in ORDER BY have backticks for OceanBase
    orderByClause = orderByClause.replace(
      /ORDER BY\s+(.+)/i,
      (match: string, columnsPart: string) => {
        // Split by comma and process each column
        const columns = columnsPart.split(",").map((col: string) => {
          const trimmed = col.trim();
          // If column doesn't have backticks or quotes, add backticks
          if (!trimmed.includes("`") && !trimmed.includes('"')) {
            // Extract column name and order direction (ASC/DESC)
            const matchResult = trimmed.match(
              /^([a-zA-Z_][a-zA-Z0-9_]*)(\s+(ASC|DESC))?$/i,
            );
            if (matchResult) {
              const colName = matchResult[1];
              const order = matchResult[2] || "";
              return `\`${colName}\`${order}`;
            }
            // If regex doesn't match, try simple split
            const parts = trimmed.split(/\s+(ASC|DESC)$/i);
            const colName = parts[0].trim();
            const order = parts[1] ? ` ${parts[1]}` : "";
            return `\`${colName}\`${order}`;
          }
          return trimmed;
        });
        return `ORDER BY ${columns.join(", ")}`;
      },
    );
  }

  // For rows query, use ROW_NUMBER() to implement LIMIT 1 BY
  const query =
    opts.select === "rows"
      ? `
    SELECT *
    FROM (
      SELECT
        ${selectString},
        ROW_NUMBER() OVER (PARTITION BY dri.project_id, dri.dataset_id, dri.dataset_run_id, dri.dataset_item_id ORDER BY dri.event_ts DESC) as rn
      FROM dataset_run_items_rmt dri 
      WHERE ${filterQuery}
    ) ranked
    WHERE rn = 1
    ${orderByClause || ""}
    ${limit !== undefined && offset !== undefined ? `LIMIT ${limit} OFFSET ${offset}` : ""};`
      : `
    SELECT
      ${selectString}
    FROM dataset_run_items_rmt dri 
    WHERE ${filterQuery}
    ${orderByClause}
    ${limit !== undefined && offset !== undefined ? `LIMIT ${limit} OFFSET ${offset}` : ""};`;

  const adapter = DatabaseAdapterFactory.getInstance();
  const res = await adapter.queryWithOptions<T>({
    query,
    params: filterParams,
    tags: {
      ...(opts.tags ?? {}),
      feature: "datasets",
      type: "dataset-run-items",
      projectId,
      ...(datasetId ? { datasetId } : {}),
    },
  });

  return res;
};

export const getDatasetRunItemsCh = async (
  opts: DatasetRunItemsTableQuery,
): Promise<DatasetRunItemDomain[]> => {
  const rows =
    await getDatasetRunItemsTableInternal<DatasetRunItemRecordReadType>({
      ...opts,
      select: "rows",
      tags: { kind: "list" },
    });

  return rows.map((row) => convertDatasetRunItemClickhouseToDomain(row));
};

export const getDatasetRunItemsByDatasetIdCh = async (
  opts: DatasetRunItemsByDatasetIdQuery,
): Promise<DatasetRunItemDomain[]> => {
  const rows =
    await getDatasetRunItemsTableInternal<DatasetRunItemRecordReadType>({
      ...opts,
      select: "rows",
      tags: { kind: "list" },
    });

  return rows.map((row) => convertDatasetRunItemClickhouseToDomain(row));
};

export const getDatasetItemIdsByTraceIdCh = async (
  opts: DatasetItemIdsByTraceIdQuery,
): Promise<{ id: string; datasetId: string }[]> => {
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

  const adapter = DatabaseAdapterFactory.getInstance();
  const query = `
  SELECT
    dataset_item_id,
    dataset_id
  FROM (
    SELECT
      dri.dataset_item_id as dataset_item_id,
      dri.dataset_id as dataset_id,
      ROW_NUMBER() OVER (PARTITION BY dri.project_id, dri.dataset_id, dri.dataset_run_id, dri.dataset_item_id ORDER BY dri.event_ts DESC) as rn
    FROM dataset_run_items_rmt dri 
    WHERE ${filterQuery}
  ) ranked
  WHERE rn = 1;`;

  const res = await adapter.queryWithOptions<{
    dataset_item_id: string;
    dataset_id: string;
  }>({
    query,
    params: filterParams,
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

export const deleteDatasetRunItemsByProjectId = async ({
  projectId,
}: {
  projectId: string;
}) => {
  const adapter = DatabaseAdapterFactory.getInstance();
  const query = `
      DELETE FROM dataset_run_items_rmt
      WHERE project_id = ?;
    `;
  await adapter.commandWithOptions({
    query: query,
    params: [projectId],
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
  const adapter = DatabaseAdapterFactory.getInstance();
  const query = `
  DELETE FROM dataset_run_items_rmt
  WHERE project_id = ?
  AND dataset_id = ?
`;

  await adapter.commandWithOptions({
    query,
    params: [projectId, datasetId],
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
  const adapter = DatabaseAdapterFactory.getInstance();
  // Handle empty datasetRunIds array by using 1=0 condition to avoid SQL syntax error with IN ()
  const datasetRunIdCondition =
    datasetRunIds.length === 0
      ? "AND 1=0"
      : `AND dataset_run_id IN (${datasetRunIds.map(() => "?").join(", ")})`;

  const query = `
    DELETE FROM dataset_run_items_rmt
    WHERE project_id = ?
    AND dataset_id = ?
    ${datasetRunIdCondition}
  `;

  await adapter.commandWithOptions({
    query,
    params: [projectId, datasetId, ...datasetRunIds],
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
  const adapter = DatabaseAdapterFactory.getInstance();
  const query = `
  SELECT
    project_id,
    COUNT(*) as count
  FROM dataset_run_items_rmt
  WHERE created_at >= ?
  AND created_at < ?
  GROUP BY project_id
`;

  const rows = await adapter.queryWithOptions<{
    project_id: string;
    count: string;
  }>({
    query,
    params: [convertDateToDateTime(start), convertDateToDateTime(end)],
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
