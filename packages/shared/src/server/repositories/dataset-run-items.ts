import Decimal from "decimal.js";
import { OrderByState } from "../../interfaces/orderBy";
import { datasetRunItemsTableUiColumnDefinitions } from "../../tableDefinitions";
import { FilterState } from "../../types";
import {
  createFilterFromFilterState,
  FilterList,
  orderByToClickhouseSql,
} from "../queries";
import { type FullDatasetRunItems } from "../queries/createDatasetRunItemsQuery";
import { queryClickhouse, commandClickhouse } from "./clickhouse";
import { convertDatasetRunItemClickhouseToDomain } from "./dataset-run-items-converters";
import { DatasetRunItemRecordReadType } from "./definitions";
import { JsonValue } from "@prisma/client/runtime/library";
import { prisma } from "../../db";
import type { Prisma } from "@prisma/client";
import { v4 } from "uuid";

// Use Prisma's default inferred type for dataset runs (no field redefinition needed)
type DatasetRun = Prisma.DatasetRunsGetPayload<{}>;
type DatasetItem = Prisma.DatasetItemGetPayload<{}>;

type DatasetRunItemsTableQuery = {
  projectId: string;
  filter: FilterState;
  orderBy?: OrderByState;
  limit?: number;
  offset?: number;
};

type DatasetRunMetricsQuery = {
  projectId: string;
  datasetId: string;
  offset?: number;
  limit?: number;
};

type DatasetRunTableWithoutMetricsRecord = {
  dataset_run_id: string;
  project_id: string;
  created_at: Date;
  updated_at: Date;
  dataset_run_name: string;
  dataset_run_description: string | null;
  dataset_run_metadata: JsonValue | null;
  count_run_items: number;
  dataset_id: string;
  avg_latency_seconds?: number;
  avg_total_cost?: number;
};

type DatasetRunTableWithoutMetrics = {
  id: string;
  projectId: string;
  createdAt: Date;
  updatedAt: Date;
  name: string;
  description: string;
  metadata: JsonValue;
  countRunItems: number;
  datasetId: string;
};

type ValidateDatasetRunAndFetchReturn =
  | {
      success: true;
      datasetRun: DatasetRun;
    }
  | {
      success: false;
      error: string;
    };

type ValidateDatasetItemAndFetchReturn =
  | {
      success: true;
      datasetItem: DatasetItem;
    }
  | {
      success: false;
      error: string;
    };

export const validateDatasetRunAndFetch = async (params: {
  datasetId: string;
  runName: string;
  projectId: string;
}): Promise<ValidateDatasetRunAndFetchReturn> => {
  const { datasetId, runName, projectId } = params;

  const datasetRun = await prisma.datasetRuns.findUnique({
    where: {
      datasetId_projectId_name: {
        datasetId,
        name: runName,
        projectId,
      },
    },
  });

  if (!datasetRun) {
    return {
      success: false,
      error:
        "Dataset run not found for the given project, dataset id and run name",
    };
  }

  return {
    success: true,
    datasetRun: datasetRun,
  };
};

export const validateDatasetItemAndFetch = async (params: {
  datasetId: string;
  itemId: string;
  projectId: string;
}): Promise<ValidateDatasetItemAndFetchReturn> => {
  const { datasetId, itemId, projectId } = params;

  const datasetItem = await prisma.datasetItem.findFirst({
    where: {
      datasetId,
      projectId,
      id: itemId,
      status: "ACTIVE",
    },
  });

  if (!datasetItem) {
    return {
      success: false,
      error:
        "Dataset item not found for the given project, dataset id and item id or is not active",
    };
  }

  return {
    success: true,
    datasetItem: datasetItem,
  };
};

const getDatasetRunItemsTableInternal = async <T>(
  opts: DatasetRunItemsTableQuery & {
    select: "count" | "rows";
    tags: Record<string, string>;
  },
): Promise<Array<T>> => {
  const selectString = (() => {
    switch (opts.select) {
      case "count":
        return "count(*) as count";
      case "rows":
        return `
          dri.id as id, 
          dri.project_id as project_id, 
          dri.trace_id as trace_id, 
          dri.observation_id as observation_id, 
          dri.dataset_id as dataset_id,
          dri.dataset_run_id as dataset_run_id, 
          dri.dataset_item_id as dataset_item_id, 
          dri.dataset_run_name as dataset_run_name,
          dri.dataset_run_description as dataset_run_description,
          dri.dataset_run_metadata as dataset_run_metadata,
          dri.created_at as created_at, 
          dri.updated_at as updated_at,
          dri.dataset_item_input as dataset_item_input,
          dri.dataset_item_expected_output as dataset_item_expected_output,
          dri.dataset_item_metadata as dataset_item_metadata,
          dri.is_deleted as is_deleted,
          dri.event_ts as event_ts`;
      default:
        throw new Error(`Unknown select type: ${opts.select}`);
    }
  })();

  const { projectId, filter, orderBy, limit, offset } = opts;
  const chFilter = createFilterFromFilterState(
    filter,
    datasetRunItemsTableUiColumnDefinitions,
  );
  const appliedFilter = new FilterList(chFilter).apply();

  const chOrderBy = orderByToClickhouseSql(
    orderBy ?? null,
    datasetRunItemsTableUiColumnDefinitions,
  );

  // joins with traces are very expensive. We need to filter by time as well.
  // We assume that a trace has to have been within a 24 h before and after interval of the dataset run to be relevant.

  const query = `
    SELECT
      ${selectString}
    FROM dataset_run_items dri 
    WHERE ${appliedFilter.query}
    ${chOrderBy}
    ${opts.select === "rows" ? "LIMIT 1 BY dri.id, dri.project_id" : ""}
    ${limit !== undefined && offset !== undefined ? `LIMIT ${limit} OFFSET ${offset}` : ""};`;

  const res = await queryClickhouse<T>({
    query,
    params: {
      ...appliedFilter.params,
    },
    tags: {
      ...(opts.tags ?? {}),
      feature: "dataset-run-items",
      type: "dataset-run-items",
      projectId,
    },
    // TODO: do I need to add clickhouseConfigs here?
  });

  return res;
};

export const getDatasetRunItemsTableCountCh = async (
  opts: DatasetRunItemsTableQuery,
) => {
  const count = await getDatasetRunItemsTableInternal<{
    count: string;
  }>({
    ...opts,
    select: "count",
    tags: { kind: "count" },
  });

  return Number(count[0].count);
};

export const getDatasetRunItemsTableCh = async (
  opts: DatasetRunItemsTableQuery,
): Promise<FullDatasetRunItems> => {
  const rows =
    await getDatasetRunItemsTableInternal<DatasetRunItemRecordReadType>({
      ...opts,
      select: "rows",
      tags: { kind: "list" },
    });

  return rows.map(convertDatasetRunItemClickhouseToDomain);
};

const getDatasetRunsTableGeneric = async (
  opts: DatasetRunMetricsQuery & { select: "count" | "rows" | "metrics" },
) => {
  const { projectId, datasetId, limit, offset } = opts;

  // joins with traces are very expensive. We need to filter by time as well.
  // We assume that a trace has to have been within a 24 h before and after interval of the dataset run to be relevant.
  let sqlSelect: string;
  let sqlGroupBy: string | null = null;
  switch (opts.select) {
    case "count":
      sqlSelect = "count(*) as count";
      break;
    case "metrics":
      sqlSelect = `
        dri.dataset_run_id as dataset_run_id,
        any(dri.project_id) as project_id,
        any(dri.dataset_run_name) as dataset_run_name,
        any(dri.dataset_run_description) as dataset_run_description,
        any(dri.dataset_run_metadata) as dataset_run_metadata,
        any(dri.dataset_run_created_at) as created_at,
        any(dri.dataset_id) as dataset_id,
        count(*) as count_run_items,
        
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
        END) as avg_total_cost`;
      sqlGroupBy = "dri.dataset_run_id";
      break;
    case "rows":
      sqlSelect = `
        dri.dataset_run_id as dataset_run_id,
        dri.project_id as project_id,
        dri.dataset_run_created_at as created_at,
        dri.dataset_run_name as dataset_run_name,
        dri.dataset_run_description as dataset_run_description,
        dri.dataset_run_metadata as dataset_run_metadata,
        count(*) as count_run_items,
        dri.dataset_id as dataset_id`;
      sqlGroupBy = `
        dri.dataset_run_id,
        dri.project_id,
        dri.dataset_run_created_at,
        dri.dataset_run_name,
        dri.dataset_run_description,
        dri.dataset_run_metadata,
        dri.dataset_id`;
      break;
    default:
      throw new Error(`Unknown select type: ${opts.select}`);
  }

  const query = `
    ${
      opts.select === "metrics"
        ? `
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
    )`
        : ""
    }
    SELECT
      ${sqlSelect}
    FROM dataset_run_items dri 
    ${
      opts.select === "metrics"
        ? `
    LEFT JOIN traces_aggregated ta
      ON dri.trace_id = ta.trace_id
      AND dri.project_id = ta.project_id
      
    LEFT JOIN observations_direct od
      ON dri.observation_id = od.observation_id
      AND dri.project_id = od.project_id
      AND dri.trace_id = od.trace_id

    `
        : ""
    }
    WHERE 
      dri.dataset_id = {datasetId: String}
      AND dri.project_id = {projectId: String}
    ${sqlGroupBy ? `GROUP BY ${sqlGroupBy}` : ""}
    ORDER BY created_at DESC
    ${limit !== undefined && offset !== undefined ? `LIMIT ${limit} OFFSET ${offset}` : ""};`;

  const res = await queryClickhouse<DatasetRunTableWithoutMetricsRecord>({
    query,
    params: {
      projectId,
      datasetId,
    },
    tags: {
      feature: "dataset-run-items",
      type: "dataset-run-items",
      projectId,
    },
    // TODO: do I need to add clickhouseConfigs here?
  });

  return res;
};

const getTraceScoresForDatasetRuns = async (
  projectId: string,
  datasetRunIds: string[],
): Promise<Array<{ dataset_run_id: string } & any>> => {
  if (datasetRunIds.length === 0) return [];

  const query = `
    SELECT 
      s.* EXCEPT (metadata),
      length(mapKeys(s.metadata)) > 0 AS has_metadata,
      dri.dataset_run_id
    FROM dataset_run_items dri 
    JOIN scores s FINAL ON dri.trace_id = s.trace_id 
      AND dri.project_id = s.project_id
    WHERE dri.project_id = {projectId: String}
      AND dri.dataset_run_id IN {datasetRunIds: Array(String)}
      AND s.project_id = {projectId: String}
    ORDER BY s.event_ts DESC
    LIMIT 1 BY s.id, s.project_id, dri.dataset_run_id
  `;

  const rows = await queryClickhouse<any>({
    query,
    params: {
      projectId,
      datasetRunIds,
    },
    tags: {
      feature: "dataset-run-items",
      type: "trace-scores",
      projectId,
    },
  });

  return rows.map((row) => ({
    ...row,
    hasMetadata: !!row.has_metadata,
  }));
};

// Simple score aggregation function following the same pattern as the web version
const aggregateScoresSimple = (scores: any[]): Record<string, any> => {
  const groupedScores: Record<string, any[]> = scores.reduce(
    (acc, score) => {
      const key = `${score.name.replaceAll(/[-\.]/g, "_")}-${score.source || "API"}-${score.data_type}`;
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(score);
      return acc;
    },
    {} as Record<string, any[]>,
  );

  return Object.entries(groupedScores).reduce(
    (acc, [key, scores]) => {
      if (scores[0].data_type === "NUMERIC") {
        const values = scores.map((score) => score.value ?? 0);
        if (!values.length) return acc;
        const average = values.reduce((a, b) => a + b, 0) / values.length;
        acc[key] = {
          type: "NUMERIC",
          values,
          average,
          comment: values.length === 1 ? scores[0].comment : undefined,
          id: values.length === 1 ? scores[0].id : undefined,
          hasMetadata: values.length === 1 ? scores[0].hasMetadata : undefined,
        };
      } else {
        const values = scores.map((score) => score.string_value ?? "n/a");
        if (!values.length) return acc;
        acc[key] = {
          type: "CATEGORICAL",
          values,
          comment: values.length === 1 ? scores[0].comment : undefined,
          id: values.length === 1 ? scores[0].id : undefined,
          hasMetadata: values.length === 1 ? scores[0].hasMetadata : undefined,
        };
      }
      return acc;
    },
    {} as Record<string, any>,
  );
};

export const getDatasetRunsTableMetrics = async (
  opts: DatasetRunMetricsQuery,
) => {
  // First get the metrics (latency, cost, counts)
  const res = await getDatasetRunsTableGeneric({
    select: "metrics",
    ...opts,
  });

  return res.map((runItem: any) => {
    return {
      id: runItem.dataset_run_id,
      projectId: runItem.project_id,
      name: runItem.dataset_run_name,
      description: runItem.dataset_run_description ?? "",
      metadata: runItem.dataset_run_metadata,
      createdAt: new Date(runItem.created_at),
      datasetId: runItem.dataset_id,
      countRunItems: runItem.count_run_items,
      avgTotalCost: runItem.avg_total_cost
        ? new Decimal(runItem.avg_total_cost)
        : new Decimal(0),
      avgLatency: runItem.avg_latency_seconds
        ? new Decimal(runItem.avg_latency_seconds)
        : new Decimal(0),
    };
  });
};

export const getDatasetRunsTableWithoutMetricsCh = async (
  opts: DatasetRunMetricsQuery,
): Promise<DatasetRunTableWithoutMetrics[]> => {
  const runItems = await getDatasetRunsTableGeneric({
    select: "rows",
    ...opts,
  });

  return runItems.map((runItem) => {
    return {
      id: runItem.dataset_run_id,
      projectId: runItem.project_id,
      createdAt: new Date(runItem.created_at),
      updatedAt: new Date(runItem.updated_at),
      name: runItem.dataset_run_name,
      description: runItem.dataset_run_description ?? "",
      metadata: runItem.dataset_run_metadata,
      countRunItems: runItem.count_run_items,
      datasetId: runItem.dataset_id,
    };
  });
};

export const deleteDatasetRunItemsByDatasetRunId = async (
  projectId: string,
  datasetRunId: string,
  datasetId: string,
) => {
  const query = `
    DELETE FROM dataset_run_items
    WHERE project_id = {projectId: String}
    AND dataset_run_id = {datasetRunId: String}
    AND dataset_id = {datasetId: String}
  `;

  await commandClickhouse({
    query,
    params: {
      projectId,
      datasetRunId,
      datasetId,
    },
    clickhouseConfigs: {
      request_timeout: 120_000, // 2 minutes
    },
    tags: {
      feature: "datasets",
      action: "delete",
    },
  });
};

export const createOrFetchDatasetRun = async ({
  projectId,
  datasetId,
  name,
  description,
  metadata,
}: {
  projectId: string;
  datasetId: string;
  name: string;
  description?: string;
  metadata?: JsonValue;
}) => {
  try {
    // Attempt optimistic creation
    const datasetRun = await prisma.datasetRuns.create({
      data: {
        id: v4(),
        datasetId,
        projectId,
        name: name,
        description: description || null,
        metadata: metadata || {},
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    return datasetRun;
  } catch (error) {
    // Check if it's a unique constraint violation
    if (isUniqueConstraintError(error)) {
      // Fetch existing run
      const existingRun = await prisma.datasetRuns.findUnique({
        where: {
          datasetId_projectId_name: {
            datasetId,
            projectId,
            name: name,
          },
        },
      });

      if (existingRun) {
        return existingRun;
      }
    } else {
      throw error;
    }
  }

  throw new Error("Failed to create or fetch dataset run");
};

const isUniqueConstraintError = (error: any): boolean => {
  return (
    error.code === "P2002" || // Prisma unique constraint
    error.message?.includes("duplicate key") ||
    error.message?.includes("UNIQUE constraint") ||
    error.message?.includes("violates unique constraint")
  );
};
