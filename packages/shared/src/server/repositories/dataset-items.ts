import { Dataset, DatasetItem, DatasetStatus, prisma, Prisma } from "../../db";
import type {
  ItemBase,
  ItemWithIO,
  DatasetItemFilters,
  PayloadError,
  CreateManyItemsInsert,
  CreateManyValidationError,
  CreateManyItemsPayload,
} from "../services/DatasetService/types";
import type { FilterState } from "../../types";
import { tableColumnsToSqlFilterAndPrefix } from "../filterToPrisma";
import { datasetItemsFilterCols } from "./dataset-items-columns";
import { InternalServerError, InvalidRequestError, LangfuseNotFoundError } from "../../errors";
import { DatasetItemValidator } from "../services/DatasetService";
import { executeWithDatasetServiceStrategy, Implementation, OperationType, toPostgresDatasetItem } from "../datasets/executeWithDatasetServiceStrategy";
import { v4 } from "uuid";

type IdOrName = { datasetId: string } | { datasetName: string };

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


/**
 * Repository for dataset item CRUD operations.
 *
 * **Usage:** Use these functions for all create/update/delete operations on dataset items.
 * Each operation validates items against dataset schemas before persisting.
 *
 * **Performance:** Uses DatasetItemValidator which compiles schemas once per operation,
 * providing 3800x+ speedup for batch operations compared to per-item compilation.
 *
 * @example
 * // Create single item
 * await createDatasetItem({ projectId, datasetId, input, expectedOutput, ... });
 *
 * // Bulk create (CSV upload, API batch)
 * await createManyDatasetItems({ projectId, items: [...], ... });
 *
 * // Upsert by ID or name
 * await upsertDatasetItem({ projectId, datasetId, datasetItemId, ... });
 */

async function getDatasets(props: {
  projectId: string;
  datasetIds: string[];
}): Promise<Pick<Dataset, "id" | "inputSchema" | "expectedOutputSchema">[]> {
  const datasets = await prisma.dataset.findMany({
    where: {
      id: { in: props.datasetIds },
      projectId: props.projectId,
    },
    select: {
      id: true,
      inputSchema: true,
      expectedOutputSchema: true,
    },
  });

  if (datasets.length !== props.datasetIds.length)
    throw new LangfuseNotFoundError(
      `One or more datasets not found for project ${props.projectId}`,
    );

  return datasets;
}

async function getDatasetById(props: {
  projectId: string;
  datasetId: string;
}): Promise<Pick<Dataset, "id" | "inputSchema" | "expectedOutputSchema">> {
  const result = await getDatasets({
    projectId: props.projectId,
    datasetIds: [props.datasetId],
  });
  return result[0]!;
}

async function getDatasetByName(props: {
  projectId: string;
  datasetName: string;
}): Promise<Pick<Dataset, "id" | "inputSchema" | "expectedOutputSchema">> {
  const dataset = await prisma.dataset.findFirst({
    where: {
      name: props.datasetName,
      projectId: props.projectId,
    },
    select: {
      id: true,
      inputSchema: true,
      expectedOutputSchema: true,
    },
  });
  if (!dataset) {
    throw new LangfuseNotFoundError(
      `Dataset ${props.datasetName} not found for project ${props.projectId}`,
    );
  }
  return dataset;
}

function mergeItemData(
  existingItem: DatasetItem,
  newData: {
    input?: string | unknown | null;
    expectedOutput?: string | unknown | null;
    metadata?: string | unknown | null;
    sourceTraceId?: string;
    sourceObservationId?: string;
    status?: DatasetStatus;
  },
) {
  return {
    input: newData.input !== undefined ? newData.input : existingItem?.input,
    expectedOutput:
      newData.expectedOutput !== undefined
        ? newData.expectedOutput
        : existingItem?.expectedOutput,
    metadata:
      newData.metadata !== undefined
        ? newData.metadata
        : existingItem?.metadata,
    sourceTraceId:
      newData.sourceTraceId === undefined
        ? existingItem?.sourceTraceId
        : newData.sourceTraceId,
    sourceObservationId:
      newData.sourceObservationId === undefined
        ? existingItem?.sourceObservationId
        : newData.sourceObservationId,
    status:
      newData.status === undefined ? existingItem?.status : newData.status,
  };
}

async function getItemById(props: {
  projectId: string;
  datasetItemId: string;
  datasetId?: string;
}): Promise<DatasetItem | null> {
  const item = await prisma.datasetItem.findUnique({
    where: {
      id_projectId: {
        id: props.datasetItemId,
        projectId: props.projectId,
      },
      ...(props.datasetId ? { datasetId: props.datasetId } : {}),
    },
  });

  return item ?? null;
}

/**
 * Creates a single dataset item with validation.
 * Validates input/expectedOutput against dataset schemas before insertion.
 *
 * **Flexible input:** Accepts both JSON strings (tRPC) and objects (Public API).
 *
 * @returns Success with created item, or validation error with details
 */
export async function createDatasetItem(props: {
  projectId: string;
  datasetId: string;
  input?: string | unknown | null;
  expectedOutput?: string | unknown | null;
  metadata?: string | unknown | null;
  sourceTraceId?: string;
  sourceObservationId?: string;
  normalizeOpts: {
    sanitizeControlChars?: boolean;
  };
  validateOpts: {
    normalizeUndefinedToNull?: boolean;
  };
}): Promise<{ success: true; datasetItem: DatasetItem } | PayloadError> {
  // Delegate to createManyDatasetItems with single item
  const result = await createManyDatasetItems({
    projectId: props.projectId,
    items: [
      {
        datasetId: props.datasetId,
        input: props.input,
        expectedOutput: props.expectedOutput,
        metadata: props.metadata,
        sourceTraceId: props.sourceTraceId,
        sourceObservationId: props.sourceObservationId,
      },
    ],
    normalizeOpts: props.normalizeOpts,
    validateOpts: props.validateOpts,
  });

  if (!result.success) {
    // Transform validation errors to PayloadError format
    const error = result.validationErrors[0];
    return {
      success: false,
      message: error.errors.map((e) => e.message).join(", "),
    };
  }

  const datasetItem = {
    ...result.datasetItems[0],
    id: result.datasetItems[0].itemId,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as DatasetItem;

  return { success: true, datasetItem };
}

/**
 * Upserts a dataset item (create if not exists, update if exists).
 * Validates against dataset schemas before persisting.
 *
 * **Flexible input:** Accepts both JSON strings (tRPC) and objects (Public API).
 *
 * @param props - Can identify dataset by ID or name
 * @returns Success with upserted item, or validation error with details
 */
export async function upsertDatasetItem(
  props: {
    projectId: string;
    datasetItemId?: string;
    input?: string | unknown | null;
    expectedOutput?: string | unknown | null;
    metadata?: string | unknown | null;
    sourceTraceId?: string;
    sourceObservationId?: string;
    status?: DatasetStatus;
    normalizeOpts?: { sanitizeControlChars?: boolean };
    validateOpts: { normalizeUndefinedToNull?: boolean };
  } & IdOrName,
): Promise<DatasetItem> {
  // 1. Get dataset
  const dataset =
    "datasetId" in props
      ? await getDatasetById({
          projectId: props.projectId,
          datasetId: props.datasetId,
        })
      : await getDatasetByName({
          projectId: props.projectId,
          datasetName: props.datasetName,
        });

  const itemId = props.datasetItemId ?? v4();

  // 2. Fetch existing item if updating (itemId provided)
  // This ensures we validate and write the complete merged state
  let existingItem: DatasetItem | null = null;
  if (props.datasetItemId) {
    existingItem = await getItemById({
      projectId: props.projectId,
      datasetItemId: props.datasetItemId,
      datasetId: dataset.id,
    });
  }

  // 3. Merge incoming data with existing data
  // For fields where props value is undefined, use existing value
  const mergedItemData = existingItem
    ? mergeItemData(existingItem, props)
    : props;

  // 4. Validate merged payload
  const validator = new DatasetItemValidator({
    inputSchema: dataset.inputSchema as Record<string, unknown> | null,
    expectedOutputSchema: dataset.expectedOutputSchema as Record<
      string,
      unknown
    > | null,
  });

  const itemPayload = validator.validateAndNormalize({
    input: mergedItemData.input,
    expectedOutput: mergedItemData.expectedOutput,
    metadata: mergedItemData.metadata,
    normalizeOpts: props.normalizeOpts,
    validateOpts: props.validateOpts,
  });

  if (!itemPayload.success) {
    throw new InvalidRequestError(
      `Dataset item validation failed: ${itemPayload.message}`,
    );
  }

  // 5. Prepare full item data for writing
  const itemData = {
    itemId: itemId,
    input: itemPayload.input,
    expectedOutput: itemPayload.expectedOutput,
    metadata: itemPayload.metadata,
    sourceTraceId: mergedItemData.sourceTraceId,
    sourceObservationId: mergedItemData.sourceObservationId,
    status: mergedItemData.status,
  };

  let item: DatasetItem | null = null;
  // 6. Update item
  await executeWithDatasetServiceStrategy(OperationType.WRITE, {
    [Implementation.STATEFUL]: async () => {
      const res = await prisma.datasetItem.upsert({
        where: {
          id_projectId: {
            id: itemId,
            projectId: props.projectId,
          },
          datasetId: dataset.id,
        },
        create: {
          ...toPostgresDatasetItem(itemData),
          datasetId: dataset.id,
          projectId: props.projectId,
        },
        update: {
          ...toPostgresDatasetItem(itemData),
        },
      });
      item = res;
    },
    [Implementation.VERSIONED]: async () => {
      // Write full item state to event table
      await prisma.datasetItemEvent.create({
        data: {
          ...itemData,
          projectId: props.projectId,
          datasetId: dataset.id,
          createdAt: new Date(),
        },
      });
    },
  });

  if (!item) {
    throw new InternalServerError("Failed to upsert dataset item");
  }

  return item;
}

/**
 * Deletes a dataset item by ID.
 *
 * @throws LangfuseNotFoundError if item doesn't exist
 */
export async function deleteDatasetItem(props: {
  projectId: string;
  datasetItemId: string;
  datasetId?: string;
}): Promise<{ success: true; deletedItem: DatasetItem }> {
  const item = await getItemById({
    projectId: props.projectId,
    datasetItemId: props.datasetItemId,
    datasetId: props.datasetId,
  });

  if (!item) {
    throw new LangfuseNotFoundError(
      `Dataset item with id ${props.datasetItemId} not found for project ${props.projectId}`,
    );
  }

  await executeWithDatasetServiceStrategy(OperationType.WRITE, {
    [Implementation.STATEFUL]: async () => {
      await prisma.datasetItem.delete({
        where: {
          id_projectId: {
            id: props.datasetItemId,
            projectId: props.projectId,
          },
        },
      });
    },
    [Implementation.VERSIONED]: async () => {
      await prisma.datasetItemEvent.create({
        data: {
          itemId: props.datasetItemId,
          projectId: props.projectId,
          datasetId: item.datasetId,
          deletedAt: new Date(),
        },
      });
    },
  });

  return { success: true, deletedItem: item };
}

/**
 * Bulk creates multiple dataset items with validation.
 * Validates all items before insertion - if any fail, none are inserted.
 *
 * **Performance:** Compiles schemas once per dataset (not per item), providing
 * 3800x+ speedup over individual validations.
 *
 * **Use cases:**
 * - CSV uploads with thousands of rows
 * - Batch API endpoints
 * - Multi-dataset operations (items can span multiple datasets)
 *
 * **Index preservation:** Validation errors include `itemIndex` to map back
 * to original CSV rows or API payloads for user-friendly error reporting.
 *
 * @param props.items - Can contain items from multiple datasets
 * @returns Success with all created items, or validation errors with indices
 */
export async function createManyDatasetItems(props: {
  projectId: string;
  items: CreateManyItemsPayload;
  normalizeOpts: { sanitizeControlChars?: boolean };
  validateOpts: { normalizeUndefinedToNull?: boolean };
}): Promise<
  | {
      success: true;
      datasetItems: CreateManyItemsInsert;
    }
  | {
      success: false;
      validationErrors: CreateManyValidationError[];
    }
> {
  // 1. Group items by datasetId and add original index (preserves CSV row mapping)
  const itemsByDataset = props.items.reduce(
    (acc, item, index) => {
      if (!acc[item.datasetId]) acc[item.datasetId] = [];
      acc[item.datasetId].push({
        ...item,
        originalIndex: index,
      });
      return acc;
    },
    {} as Record<
      string,
      Array<
        CreateManyItemsPayload[number] & {
          originalIndex: number;
        }
      >
    >,
  );
  const datasetIds = Object.keys(itemsByDataset);

  const result = await getDatasets({
    projectId: props.projectId,
    datasetIds,
  });

  // Create a map of dataset schemas for quick lookup
  const datasetSchemaMap = new Map(
    result.map((dataset) => [
      dataset.id,
      {
        inputSchema: dataset.inputSchema as Record<string, unknown> | null,
        expectedOutputSchema: dataset.expectedOutputSchema as Record<
          string,
          unknown
        > | null,
      },
    ]),
  );

  // 3. Validate all items, collect errors with original index
  const validationErrors: CreateManyValidationError[] = [];
  const preparedItems: CreateManyItemsInsert = [];
  const createdAt = new Date();

  for (const datasetId of datasetIds) {
    const datasetItems = itemsByDataset[datasetId];
    const schema = datasetSchemaMap.get(datasetId);

    if (!schema) {
      // Should never happen due to getDatasets validation
      continue;
    }

    const validator = new DatasetItemValidator({
      inputSchema: schema.inputSchema,
      expectedOutputSchema: schema.expectedOutputSchema,
    });

    // Validate each item in this dataset
    for (const item of datasetItems) {
      const result = validator.validateAndNormalize({
        input: item.input,
        expectedOutput: item.expectedOutput,
        metadata: item.metadata,
        normalizeOpts: props.normalizeOpts,
        validateOpts: props.validateOpts,
      });

      if (!result.success) {
        // Validation failed - add errors with original index
        if (result.cause?.inputErrors) {
          validationErrors.push({
            itemIndex: item.originalIndex,
            field: "input",
            errors: result.cause.inputErrors,
          });
        }
        if (result.cause?.expectedOutputErrors) {
          validationErrors.push({
            itemIndex: item.originalIndex,
            field: "expectedOutput",
            errors: result.cause.expectedOutputErrors,
          });
        }
      } else {
        // Validation passed - prepare for insert
        preparedItems.push({
          itemId: v4(),
          projectId: props.projectId,
          status: DatasetStatus.ACTIVE,
          datasetId: item.datasetId,
          input: result.input,
          expectedOutput: result.expectedOutput,
          metadata: result.metadata,
          sourceTraceId: item.sourceTraceId,
          sourceObservationId: item.sourceObservationId,
          createdAt,
        });
      }
    }
  }

  // 4. If any validation errors, return early
  if (validationErrors.length > 0) {
    return {
      success: false,
      validationErrors,
    };
  }

  // 5. Bulk insert all valid items
  await executeWithDatasetServiceStrategy(OperationType.WRITE, {
    [Implementation.STATEFUL]: async () => {
      await prisma.datasetItem.createMany({
        data: preparedItems.map(toPostgresDatasetItem),
      });
    },
    [Implementation.VERSIONED]: async () => {
      await prisma.datasetItemEvent.createMany({ data: preparedItems });
    },
  });

  return {
    success: true,
    datasetItems: preparedItems,
  };
}
