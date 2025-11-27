import { DatasetStatus, prisma } from "../../db";
import type { ItemBase, ItemWithIO } from "../services/DatasetService/types";

/**
 * Query parameters for fetching dataset items by version
 */
type DatasetItemsByVersionQuery = {
  projectId: string;
  datasetId: string;
  version: Date;
  includeIO: boolean;
  returnVersionTimestamp?: boolean;
};

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
};

/**
 * Builds the SQL query for fetching dataset items at a specific version.
 * This query uses DISTINCT ON to get the latest event for each item ID
 * where created_at <= version, and filters out items that are deleted at that version.
 *
 * @param includeIO - Whether to include input/output/metadata fields in SELECT
 * @param returnVersionTimestamp - Whether to include MAX(created_at) as latest_version
 * @param limit - Optional LIMIT for pagination
 * @param offset - Optional OFFSET for pagination
 * @returns SQL query string with placeholders for projectId, datasetId, version
 */
function buildDatasetItemsVersionQuery(
  includeIO: boolean,
  returnVersionTimestamp: boolean,
  limit?: number,
  offset?: number,
): string {
  const ioFields = includeIO ? "input, expected_output, metadata," : "";
  const versionField = returnVersionTimestamp
    ? ", MAX(created_at) OVER () as latest_version"
    : "";

  const paginationClause =
    limit !== undefined
      ? `LIMIT ${limit}${offset !== undefined ? ` OFFSET ${offset}` : ""}`
      : "";

  return `
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
      WHERE project_id = $1
      AND dataset_id = $2
      AND created_at <= $3
      ORDER BY item_id, created_at DESC
    )
    SELECT
      item_id,
      project_id,
      dataset_id,
      ${ioFields}
      source_trace_id,
      source_observation_id,
      status,
      created_at
      ${versionField ? ", latest_version" : ""}
    FROM latest_events
    WHERE deleted_at IS NULL
     OR deleted_at > $3
    ORDER BY item_id
    ${paginationClause}
  `;
}

/**
 * Builds the SQL query for counting dataset items at a specific version.
 * Same logic as buildDatasetItemsVersionQuery but returns COUNT(*) instead.
 */
function buildDatasetItemsVersionCountQuery(): string {
  return `
    WITH latest_events AS (
      SELECT DISTINCT ON (item_id)
        item_id,
        deleted_at
      FROM dataset_item_events
      WHERE project_id = $1
      AND dataset_id = $2
      AND created_at <= $3
      ORDER BY item_id, created_at DESC
    )
    SELECT COUNT(*) as count
    FROM latest_events
    WHERE deleted_at IS NULL
     OR deleted_at > $3
  `;
}

/**
 * Converts a raw database row to ItemBase or ItemWithIO
 */
function convertRowToItem<IncludeIO extends boolean = true>(
  row: QueryGetDatasetItemRow,
  includeIO: IncludeIO,
): IncludeIO extends true ? ItemWithIO : ItemBase {
  const base: ItemBase = {
    id: row.item_id,
    projectId: row.project_id,
    datasetId: row.dataset_id,
    sourceTraceId: row.source_trace_id,
    sourceObservationId: row.source_observation_id,
    status: row.status,
    createdAt: row.created_at,
  };

  return (
    includeIO
      ? {
          ...base,
          input: row.input,
          expectedOutput: row.expected_output,
          metadata: row.metadata,
          status: row.status,
          createdAt: row.created_at,
        }
      : base
  ) as IncludeIO extends true ? ItemWithIO : ItemBase;
}

/**
 * Retrieves dataset items at a specific version timestamp.
 * For each unique item ID, returns the latest event where:
 * - createdAt <= version
 * - deletedAt IS NULL OR deletedAt > version
 *
 * @param params.includeIO - Whether to include input/expectedOutput/metadata in results
 * @param params.returnVersionTimestamp - Whether to return the actual version timestamp used
 * @param params.limit - Optional LIMIT for pagination
 * @param params.offset - Optional OFFSET for pagination
 * @returns Array of items, or object with items + versionTimestamp if requested
 */
export async function getDatasetItemsByVersion<
  IncludeIO extends boolean = true,
  ReturnVersion extends boolean = false,
>(
  params: DatasetItemsByVersionQuery & {
    includeIO: IncludeIO;
    returnVersionTimestamp?: ReturnVersion;
    limit?: number;
    offset?: number;
  },
): Promise<
  ReturnVersion extends true
    ? {
        items: Array<IncludeIO extends true ? ItemWithIO : ItemBase>;
        versionTimestamp: Date;
      }
    : Array<IncludeIO extends true ? ItemWithIO : ItemBase>
> {
  const query = buildDatasetItemsVersionQuery(
    params.includeIO,
    params.returnVersionTimestamp ?? false,
    params.limit,
    params.offset,
  );

  const result = await prisma.$queryRawUnsafe<QueryGetDatasetItemRow[]>(
    query,
    params.projectId,
    params.datasetId,
    params.version,
  );

  const items = result.map((row) => convertRowToItem(row, params.includeIO));

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
 * @returns Number of active items at the specified version
 */
export async function getDatasetItemsCountByVersion(params: {
  projectId: string;
  datasetId: string;
  version: Date;
}): Promise<number> {
  const query = buildDatasetItemsVersionCountQuery();

  const result = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    query,
    params.projectId,
    params.datasetId,
    params.version,
  );

  return result.length > 0 ? Number(result[0].count) : 0;
}
