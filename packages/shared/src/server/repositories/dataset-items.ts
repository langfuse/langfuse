import { DatasetStatus, prisma, Prisma } from "../../db";
import type {
  ItemBase,
  ItemWithIO,
  DatasetItemFilters,
} from "../services/DatasetService/types";
import type { FilterState } from "../../types";
import { tableColumnsToSqlFilterAndPrefix } from "../filterToPrisma";
import { datasetItemsFilterCols } from "./dataset-items-columns";

/**
 * Raw database row for getting dataset items by version from dataset_item_events table
 */
type QueryGetDatasetItemRow = {
  item_id: string;
  project_id: string;
  dataset_id: string;
  input?: any;
  expected_output?: any;
  metadata?: any;
  source_trace_id: string | null;
  source_observation_id: string | null;
  status: DatasetStatus;
  created_at: Date;
  latest_version: Date;
  dataset_name?: string;
};

/**
 * Default filter for dataset items - always filter ACTIVE status
 */
const DEFAULT_DATASET_ITEM_FILTERS: DatasetItemFilters = {
  status: "ACTIVE",
};

/**
 * Apply default filters with user overrides
 */
export function applyDefaultFilters(
  filters?: DatasetItemFilters,
): DatasetItemFilters {
  return {
    ...DEFAULT_DATASET_ITEM_FILTERS,
    ...filters,
  };
}

/**
 * Converts clean DatasetItemFilters object to FilterState array
 * for use with tableColumnsToSqlFilterAndPrefix
 */
export function convertFiltersToFilterState(
  filters: DatasetItemFilters,
): FilterState {
  const filterState: FilterState = [];

  if (filters.datasetId) {
    filterState.push({
      type: "string",
      column: "datasetId",
      operator: "=",
      value: filters.datasetId,
    });
  }

  if (filters.itemIds && filters.itemIds.length > 0) {
    filterState.push({
      type: "stringOptions",
      column: "id",
      operator: "any of",
      value: filters.itemIds,
    });
  }

  if (filters.sourceTraceId !== undefined) {
    if (filters.sourceTraceId === null) {
      filterState.push({
        type: "null",
        column: "sourceTraceId",
        operator: "is null",
        value: "",
      });
    } else {
      filterState.push({
        type: "string",
        column: "sourceTraceId",
        operator: "=",
        value: filters.sourceTraceId,
      });
    }
  }

  if (filters.sourceObservationId !== undefined) {
    if (filters.sourceObservationId === null) {
      filterState.push({
        type: "null",
        column: "sourceObservationId",
        operator: "is null",
        value: "",
      });
    } else {
      filterState.push({
        type: "string",
        column: "sourceObservationId",
        operator: "=",
        value: filters.sourceObservationId,
      });
    }
  }

  if (filters.status === "ACTIVE") {
    filterState.push({
      type: "stringOptions",
      column: "status",
      operator: "any of",
      value: ["ACTIVE"],
    });
  }

  return filterState;
}

/**
 * Builds the SQL query for fetching dataset items at a specific version.
 * This query uses DISTINCT ON to get the latest event for each item ID
 * where created_at <= version, and filters out items that are deleted at that version.
 *
 * @param projectId - Project ID
 * @param version - Version timestamp
 * @param includeIO - Whether to include input/output/metadata fields in SELECT
 * @param includeDatasetName - Whether to JOIN datasets table and include dataset name
 * @param returnVersionTimestamp - Whether to include MAX(created_at) as latest_version
 * @param filter - FilterState array for filtering (includes datasetId)
 * @param limit - Optional LIMIT for pagination
 * @param offset - Optional OFFSET for pagination
 * @returns Prisma.Sql query
 */
function buildDatasetItemsVersionQuery(
  projectId: string,
  version: Date,
  includeIO: boolean,
  includeDatasetName: boolean,
  returnVersionTimestamp: boolean,
  filter: FilterState,
  limit?: number,
  offset?: number,
): Prisma.Sql {
  const ioFields = includeIO
    ? Prisma.sql`input, expected_output, metadata,`
    : Prisma.empty;

  const versionField = returnVersionTimestamp
    ? Prisma.sql`, MAX(created_at) OVER () as latest_version`
    : Prisma.empty;

  const datasetJoin = includeDatasetName
    ? Prisma.sql`LEFT JOIN datasets d ON le.dataset_id = d.id AND le.project_id = d.project_id`
    : Prisma.empty;

  const datasetNameField = includeDatasetName
    ? Prisma.sql`, d.name as dataset_name`
    : Prisma.empty;

  const filterCondition = tableColumnsToSqlFilterAndPrefix(
    filter,
    datasetItemsFilterCols,
    "dataset_item_events",
  );

  const paginationClause =
    limit !== undefined
      ? Prisma.sql`LIMIT ${limit}${offset !== undefined ? Prisma.sql` OFFSET ${offset}` : Prisma.empty}`
      : Prisma.empty;

  return Prisma.sql`
    WITH latest_events AS (
      SELECT DISTINCT ON (item_id)
        item_id,
        project_id,
        dataset_id,
        ${ioFields}
        source_trace_id,
        source_observation_id,
        status,
        created_at,
        deleted_at
        ${versionField}
      FROM dataset_item_events
      WHERE project_id = ${projectId}
      AND created_at <= ${version}
      ORDER BY item_id, created_at DESC
    )
    SELECT
      le.item_id,
      le.project_id,
      le.dataset_id,
      ${ioFields}
      le.source_trace_id,
      le.source_observation_id,
      le.status,
      le.created_at
      ${versionField}
      ${datasetNameField}
    FROM latest_events le
    ${datasetJoin}
    WHERE (le.deleted_at IS NULL OR le.deleted_at > ${version})
    ${filterCondition}
    ORDER BY le.item_id
    ${paginationClause}
  `;
}

/**
 * Builds the SQL query for counting dataset items at a specific version.
 * Same logic as buildDatasetItemsVersionQuery but returns COUNT(*) instead.
 */
function buildDatasetItemsVersionCountQuery(
  projectId: string,
  version: Date,
  filter: FilterState,
): Prisma.Sql {
  const filterCondition = tableColumnsToSqlFilterAndPrefix(
    filter,
    datasetItemsFilterCols,
    "dataset_item_events",
  );

  return Prisma.sql`
    WITH latest_events AS (
      SELECT DISTINCT ON (item_id)
        item_id,
        dataset_id,
        project_id,
        source_trace_id,
        source_observation_id,
        status,
        deleted_at
      FROM dataset_item_events
      WHERE project_id = ${projectId}
      AND created_at <= ${version}
      ORDER BY item_id, created_at DESC
    )
    SELECT COUNT(*) as count
    FROM latest_events le
    WHERE (deleted_at IS NULL OR deleted_at > ${version})
    ${filterCondition}
  `;
}

/**
 * Converts a raw database row to ItemBase or ItemWithIO, optionally including datasetName
 */
function convertRowToItem<
  IncludeIO extends boolean = true,
  IncludeDatasetName extends boolean = false,
>(
  row: QueryGetDatasetItemRow,
  includeIO: IncludeIO,
  includeDatasetName: IncludeDatasetName,
): IncludeIO extends true
  ? IncludeDatasetName extends true
    ? ItemWithIO & { datasetName: string }
    : ItemWithIO
  : IncludeDatasetName extends true
    ? ItemBase & { datasetName: string }
    : ItemBase {
  const base: ItemBase = {
    id: row.item_id,
    projectId: row.project_id,
    datasetId: row.dataset_id,
    sourceTraceId: row.source_trace_id,
    sourceObservationId: row.source_observation_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.created_at,
  };

  const withIO = includeIO
    ? {
        ...base,
        input: row.input,
        expectedOutput: row.expected_output,
        metadata: row.metadata,
        status: row.status,
        createdAt: row.created_at,
      }
    : base;

  const withDatasetName = includeDatasetName
    ? { ...withIO, datasetName: row.dataset_name! }
    : withIO;

  return withDatasetName as any;
}

/**
 * Retrieves dataset items at a specific version timestamp.
 * For each unique item ID, returns the latest event where:
 * - createdAt <= version
 * - deletedAt IS NULL OR deletedAt > version
 *
 * @param params.includeIO - Whether to include input/expectedOutput/metadata in results
 * @param params.includeDatasetName - Whether to JOIN datasets table and include dataset name
 * @param params.returnVersionTimestamp - Whether to return the actual version timestamp used
 * @param params.filter - FilterState array for additional filtering
 * @param params.limit - Optional LIMIT for pagination
 * @param params.offset - Optional OFFSET for pagination
 * @returns Array of items, or object with items + versionTimestamp if requested
 */
export async function getDatasetItemsByVersion<
  IncludeIO extends boolean = true,
  IncludeDatasetName extends boolean = false,
  ReturnVersion extends boolean = false,
>(params: {
  projectId: string;
  version: Date;
  includeIO: IncludeIO;
  includeDatasetName?: IncludeDatasetName;
  returnVersionTimestamp?: ReturnVersion;
  filter: FilterState;
  limit?: number;
  offset?: number;
}): Promise<
  ReturnVersion extends true
    ? {
        items: Array<
          IncludeIO extends true
            ? IncludeDatasetName extends true
              ? ItemWithIO & { datasetName: string }
              : ItemWithIO
            : IncludeDatasetName extends true
              ? ItemBase & { datasetName: string }
              : ItemBase
        >;
        versionTimestamp: Date;
      }
    : Array<
        IncludeIO extends true
          ? IncludeDatasetName extends true
            ? ItemWithIO & { datasetName: string }
            : ItemWithIO
          : IncludeDatasetName extends true
            ? ItemBase & { datasetName: string }
            : ItemBase
      >
> {
  const query = buildDatasetItemsVersionQuery(
    params.projectId,
    params.version,
    params.includeIO,
    params.includeDatasetName ?? false,
    params.returnVersionTimestamp ?? false,
    params.filter,
    params.limit,
    params.offset,
  );

  const result = await prisma.$queryRaw<QueryGetDatasetItemRow[]>(query);

  const items = result.map((row) =>
    convertRowToItem(row, params.includeIO, params.includeDatasetName ?? false),
  );

  if (params.returnVersionTimestamp) {
    const versionTimestamp =
      result.length > 0 && result[0].latest_version
        ? result[0].latest_version
        : params.version;
    return { items, versionTimestamp } as any;
  }

  return items as any;
}

/**
 * Counts dataset items at a specific version timestamp.
 * Uses the same logic as getDatasetItemsByVersion but returns only the count.
 *
 * @param params.filters - Optional filters to apply (defaults to ACTIVE status)
 * @returns Number of items matching filters at the specified version
 */
export async function getDatasetItemsCountByVersion(params: {
  projectId: string;
  version: Date;
  filters?: DatasetItemFilters;
}): Promise<number> {
  const filtersWithDefaults = applyDefaultFilters(params.filters);
  const filterState = convertFiltersToFilterState(filtersWithDefaults);

  const query = buildDatasetItemsVersionCountQuery(
    params.projectId,
    params.version,
    filterState,
  );

  const result = await prisma.$queryRaw<Array<{ count: bigint }>>(query);

  return result.length > 0 ? Number(result[0].count) : 0;
}
