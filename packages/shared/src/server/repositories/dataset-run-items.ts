import { DatasetRunItemDomain } from "../../domain/dataset-run-items";
import { type OrderByState } from "../../interfaces/orderBy";
import { FilterState } from "../../types";
import { ClickHouseClientConfigOptions } from "@clickhouse/client";
import Decimal from "decimal.js";
import { ScoreAggregate } from "../../features/scores";
import {
  deleteDatasetRunItemsByDatasetIdFromGreptime,
  deleteDatasetRunItemsByDatasetRunIdsFromGreptime,
  deleteDatasetRunItemsByProjectIdFromGreptime,
} from "../greptime/deletion";
import {
  type DatasetRunsMetrics,
  getDatasetItemIdsByTraceIdGreptime,
  getDatasetItemIdsWithRunDataGreptime,
  getDatasetItemsWithRunDataCountGreptime,
  getDatasetRunItemCountsByProjectInCreationIntervalGreptime,
  getDatasetRunItemsCountByDatasetIdGreptime,
  getDatasetRunItemsCountGreptime,
  getDatasetRunItemsByDatasetIdGreptime,
  getDatasetRunItemsGreptime,
  getDatasetRunItemsWithoutIOByItemIdsGreptime,
  getDatasetRunsTableCountGreptime,
  getDatasetRunsTableMetricsGreptime,
  getDatasetRunsTableRowsGreptime,
  hasAnyDatasetRunItemGreptime,
} from "./greptime/datasetRunItems";

/**
 * Dataset-run-items read + delete surface. The implementation reads/writes the GreptimeDB
 * `dataset_run_items` projection (04-read-path.md, P4); these exports are thin delegates that keep
 * the original signatures (callers: dataset-router tRPC, public-api REST, worker export stream,
 * evalService, telemetry, project/dataset deletion workers). See `greptime/datasetRunItems.ts`.
 */

export type { DatasetRunsMetrics } from "./greptime/datasetRunItems";

type DatasetRunItemsTableQuery = {
  projectId: string;
  filter: FilterState;
  datasetId?: string;
  orderBy?: OrderByState | OrderByState[];
  limit?: number;
  offset?: number;
  clickhouseConfigs?: ClickHouseClientConfigOptions;
};

type DatasetRunItemsByDatasetIdQuery = Omit<
  DatasetRunItemsTableQuery,
  "datasetId"
> & { datasetId: string };

type DatasetRunsMetricsTableQuery = {
  projectId: string;
  datasetId: string;
  filter: FilterState;
  runIds?: string[];
  orderBy?: OrderByState;
  limit?: number;
  offset?: number;
};

type DatasetItemsWithRunDataCountQuery = {
  projectId: string;
  datasetId: string;
  runIds: string[];
  filterByRun: { runId: string; filters: FilterState }[];
};

type DatasetItemIdsWithRunDataQuery = DatasetItemsWithRunDataCountQuery & {
  limit?: number;
  offset?: number;
};

type DatasetRunItemsByItemIdsWithoutIOQuery = {
  projectId: string;
  datasetId: string;
  runIds: string[];
  datasetItemIds: string[];
};

type DatasetItemIdsByTraceIdQuery = {
  projectId: string;
  traceId: string;
  filter: FilterState;
};

export type DatasetRunsRows = {
  id: string;
  name: string;
  projectId: string;
  createdAt: Date;
  datasetId: string;
  description: string;
  metadata: string;
};

/** Enriched run item shape assembled by the dataset router; kept here for import stability. */
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

// ---------------------------------------------------------------------------
// dataset runs table (metrics / rows / count)
// ---------------------------------------------------------------------------

export const getDatasetRunsTableMetricsCh = (
  opts: DatasetRunsMetricsTableQuery,
): Promise<DatasetRunsMetrics[]> => getDatasetRunsTableMetricsGreptime(opts);

export const getDatasetRunsTableRowsCh = (
  opts: DatasetRunsMetricsTableQuery,
): Promise<DatasetRunsRows[]> => getDatasetRunsTableRowsGreptime(opts);

export const getDatasetRunsTableCountCh = (
  opts: DatasetRunsMetricsTableQuery,
): Promise<number> => getDatasetRunsTableCountGreptime(opts);

// ---------------------------------------------------------------------------
// dataset run items list / count
// ---------------------------------------------------------------------------

export const getDatasetRunItemsCh = (
  opts: DatasetRunItemsTableQuery,
): Promise<DatasetRunItemDomain[]> =>
  getDatasetRunItemsGreptime({
    projectId: opts.projectId,
    filter: opts.filter,
    datasetId: opts.datasetId,
    orderBy: opts.orderBy,
    limit: opts.limit,
    offset: opts.offset,
  });

export const getDatasetRunItemsByDatasetIdCh = (
  opts: DatasetRunItemsByDatasetIdQuery,
): Promise<DatasetRunItemDomain[]> =>
  getDatasetRunItemsByDatasetIdGreptime({
    projectId: opts.projectId,
    filter: opts.filter,
    datasetId: opts.datasetId,
    orderBy: opts.orderBy,
    limit: opts.limit,
    offset: opts.offset,
  });

export const getDatasetRunItemsCountCh = (
  opts: DatasetRunItemsTableQuery,
): Promise<number> =>
  getDatasetRunItemsCountGreptime({
    projectId: opts.projectId,
    filter: opts.filter,
    datasetId: opts.datasetId,
  });

export const getDatasetRunItemsCountByDatasetIdCh = (
  opts: DatasetRunItemsByDatasetIdQuery,
): Promise<number> =>
  getDatasetRunItemsCountByDatasetIdGreptime({
    projectId: opts.projectId,
    filter: opts.filter,
    datasetId: opts.datasetId,
  });

export const getDatasetRunItemsWithoutIOByItemIds = (
  opts: DatasetRunItemsByItemIdsWithoutIOQuery,
): Promise<DatasetRunItemDomain<false>[]> =>
  getDatasetRunItemsWithoutIOByItemIdsGreptime(opts);

// ---------------------------------------------------------------------------
// multi-run comparison
// ---------------------------------------------------------------------------

export const getDatasetItemsWithRunDataCount = (
  opts: DatasetItemsWithRunDataCountQuery,
): Promise<number> => getDatasetItemsWithRunDataCountGreptime(opts);

export const getDatasetItemIdsWithRunData = (
  opts: DatasetItemIdsWithRunDataQuery,
): Promise<string[]> => getDatasetItemIdsWithRunDataGreptime(opts);

// ---------------------------------------------------------------------------
// lookups / existence / analytics
// ---------------------------------------------------------------------------

export const getDatasetItemIdsByTraceIdCh = (
  opts: DatasetItemIdsByTraceIdQuery,
): Promise<{ id: string; datasetId: string; observationId: string | null }[]> =>
  getDatasetItemIdsByTraceIdGreptime(opts);

export const hasAnyDatasetRunItem = (projectId: string): Promise<boolean> =>
  hasAnyDatasetRunItemGreptime(projectId);

export const getDatasetRunItemCountsByProjectInCreationInterval = (params: {
  start: Date;
  end: Date;
}): Promise<{ projectId: string; count: number }[]> =>
  getDatasetRunItemCountsByProjectInCreationIntervalGreptime(params);

// ---------------------------------------------------------------------------
// deletion (per-entity + project)
// ---------------------------------------------------------------------------

export const deleteDatasetRunItemsByProjectId = async (
  projectId: string,
): Promise<boolean> => {
  const hasData = await hasAnyDatasetRunItemGreptime(projectId);
  if (!hasData) return false;
  await deleteDatasetRunItemsByProjectIdFromGreptime(projectId);
  return true;
};

export const deleteDatasetRunItemsByDatasetId = (params: {
  projectId: string;
  datasetId: string;
}): Promise<void> => deleteDatasetRunItemsByDatasetIdFromGreptime(params);

export const deleteDatasetRunItemsByDatasetRunIds = (params: {
  projectId: string;
  datasetRunIds: string[];
  datasetId: string;
}): Promise<void> =>
  deleteDatasetRunItemsByDatasetRunIdsFromGreptime({
    projectId: params.projectId,
    datasetId: params.datasetId,
    datasetRunIds: params.datasetRunIds,
  });
