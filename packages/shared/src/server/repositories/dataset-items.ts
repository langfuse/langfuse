import { Dataset, DatasetItem, DatasetStatus, prisma, Prisma } from "../../db";
import type { FilterState } from "../../types";
import { tableColumnsToSqlFilterAndPrefix } from "../filterToPrisma";
import { datasetItemsFilterCols } from "./dataset-items-columns";
import {
  InternalServerError,
  InvalidRequestError,
  LangfuseNotFoundError,
} from "../../errors";
import { DatasetItemValidator } from "../services/DatasetService";
import {
  executeWithDatasetServiceStrategy,
  Implementation,
  OperationType,
  toPostgresDatasetItem,
} from "../datasets/executeWithDatasetServiceStrategy";
import { v4 } from "uuid";
import { FieldValidationError } from "../../utils/jsonSchemaValidation";
import { DatasetItemDomain, DatasetItemDomainWithoutIO } from "../../domain";
import { logger } from "../logger";
import { ColumnDefinition } from "../../tableDefinitions";

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

/**
 * Converts a DatasetItem to Domain types with optional IO fields and dataset name.
 * Automatically excludes version columns (sysId, validFrom, isDeleted).
 */
function toDomainType<
  IncludeIO extends boolean = true,
  IncludeDatasetName extends boolean = false,
>(
  item: DatasetItem & { dataset?: { name: string } },
  includeIO?: IncludeIO,
  includeDatasetName?: IncludeDatasetName,
): IncludeIO extends true
  ? IncludeDatasetName extends true
    ? DatasetItemDomain & { datasetName: string }
    : DatasetItemDomain
  : IncludeDatasetName extends true
    ? DatasetItemDomainWithoutIO & { datasetName: string }
    : DatasetItemDomainWithoutIO;

function toDomainType<
  IncludeIO extends boolean = true,
  IncludeDatasetName extends boolean = false,
>(
  item: DatasetItem & { dataset?: { name: string } },
  includeIO: IncludeIO = true as IncludeIO,
  includeDatasetName: IncludeDatasetName = false as IncludeDatasetName,
):
  | DatasetItemDomain
  | DatasetItemDomainWithoutIO
  | (DatasetItemDomain & { datasetName: string })
  | (DatasetItemDomainWithoutIO & { datasetName: string }) {
  const base: DatasetItemDomainWithoutIO = {
    id: item.id,
    projectId: item.projectId,
    datasetId: item.datasetId,
    status: item.status ?? "ACTIVE",
    sourceTraceId: item.sourceTraceId ?? null,
    sourceObservationId: item.sourceObservationId ?? null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };

  // Add IO fields if requested (or if not specified and they're present)
  const shouldIncludeIO =
    includeIO === true ||
    (includeIO === undefined &&
      ("input" in item || "expectedOutput" in item || "metadata" in item));

  const withIO = shouldIncludeIO
    ? {
        ...base,
        input: item.input ?? null,
        expectedOutput: item.expectedOutput ?? null,
        metadata: item.metadata ?? null,
      }
    : base;

  // Add dataset name if requested
  const withDatasetName =
    includeDatasetName && item.dataset
      ? { ...withIO, datasetName: item.dataset.name }
      : withIO;

  return withDatasetName as any;
}

function mergeItemData(
  existingItem: DatasetItemDomain,
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
}): Promise<{ success: true; datasetItem: DatasetItemDomain } | PayloadError> {
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
  } as DatasetItemDomain;

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
): Promise<DatasetItemDomain> {
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
  let existingItem: DatasetItemDomain | null = null;
  if (props.datasetItemId) {
    existingItem = await getDatasetItemById({
      projectId: props.projectId,
      datasetItemId: props.datasetItemId,
      datasetId: dataset.id,
      status: "ALL",
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

  if (!item) {
    throw new InternalServerError("Failed to upsert dataset item");
  }

  return toDomainType(item);
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
}): Promise<{ success: true; deletedItem: DatasetItemDomain }> {
  const item = await getDatasetItemById({
    projectId: props.projectId,
    datasetItemId: props.datasetItemId,
    datasetId: props.datasetId,
    status: "ALL",
  });

  if (!item) {
    throw new LangfuseNotFoundError(
      `Dataset item with id ${props.datasetItemId} not found for project ${props.projectId}`,
    );
  }

  await prisma.datasetItem.delete({
    where: {
      id_projectId: {
        id: props.datasetItemId,
        projectId: props.projectId,
      },
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
  await prisma.datasetItem.createMany({
    data: preparedItems.map(toPostgresDatasetItem),
  });

  return {
    success: true,
    datasetItems: preparedItems,
  };
}

// dedupe

type IdOrName = { datasetId: string } | { datasetName: string };

export type PayloadError = {
  success: false;
  message: string;
  cause?: {
    inputErrors?: FieldValidationError[];
    expectedOutputErrors?: FieldValidationError[];
  };
};

export type CreateManyItemsPayload = {
  datasetId: string;
  input?: string | unknown | null;
  expectedOutput?: string | unknown | null;
  metadata?: string | unknown | null;
  sourceTraceId?: string;
  sourceObservationId?: string;
}[];

export type CreateManyItemsInsert = {
  itemId: string;
  projectId: string;
  datasetId: string;
  status: DatasetStatus;
  input: Prisma.NullTypes.DbNull | Prisma.InputJsonValue | undefined;
  expectedOutput: Prisma.NullTypes.DbNull | Prisma.InputJsonValue | undefined;
  metadata: Prisma.NullTypes.DbNull | Prisma.InputJsonValue | undefined;
  sourceTraceId?: string;
  sourceObservationId?: string;
  createdAt: Date;
}[];

/**
 * Type for bulk dataset item validation errors
 * Used when validating multiple items before creation (e.g., CSV upload)
 */
export type CreateManyValidationError = {
  itemIndex: number;
  field: "input" | "expectedOutput";
  errors: Array<{
    path: string;
    message: string;
    keyword?: string;
  }>;
};

export type ItemBase = Omit<
  DatasetItem,
  "input" | "expectedOutput" | "metadata"
>;

export type ItemWithIO = ItemBase & {
  input: Prisma.JsonValue;
  expectedOutput: Prisma.JsonValue;
  metadata: Prisma.JsonValue;
};

/**
 * Utility type to add datasetName to an item type
 */
export type ItemWithDatasetName<T> = T & {
  datasetName: string;
};

/**
 * Filter options for querying dataset items
 * Used by dataset-items repository for clean API
 */
export type DatasetItemFilters = {
  datasetIds?: string[]; // Filter for one or multiple dataset IDs
  itemIds?: string[];
  sourceTraceId?: string | null; // null = filter for IS NULL, undefined = no filter
  sourceObservationId?: string | null; // null = filter for IS NULL, undefined = no filter
  status?: "ACTIVE" | "ALL"; // Defaults to 'ACTIVE' at manager level
};

/**
 * Raw database row for getting latest dataset items from dataset_items table
 */
type QueryGetLatestDatasetItemRow = {
  id: string;
  project_id: string;
  dataset_id: string;
  input?: any;
  expected_output?: any;
  metadata?: any;
  source_trace_id: string | null;
  source_observation_id: string | null;
  status: DatasetStatus;
  created_at: Date;
  updated_at: Date;
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
 * Validates FilterState against column definitions and converts to DatasetItemFilters
 * Similar to tableColumnsToSqlFilterAndPrefix but returns typed DatasetItemFilters instead of SQL
 *
 * @param filterState - The filter state to validate and convert
 * @param tableColumns - Column definitions to validate against (e.g., evalDatasetFormFilterCols)
 * @returns DatasetItemFilters object that can be passed to repository functions
 * @throws Error if filter references unknown column
 *
 */
export function validateAndConvertToDatasetItemFilters(
  filterState: FilterState,
  tableColumns: ColumnDefinition[],
): DatasetItemFilters | null {
  const filters: DatasetItemFilters = {};

  for (const filter of filterState) {
    // Validate that the column exists in the column definitions
    const col = tableColumns.find(
      (c) => c.name === filter.column || c.id === filter.column,
    );
    if (!col) {
      logger.error("Invalid filter column", filter.column);
      throw new Error("Invalid filter column: " + filter.column);
    }

    // Map validated column to DatasetItemFilters
    if (col.id === "datasetId" && filter.type === "stringOptions") {
      filters.datasetIds = filter.value;
    }
  }

  return filters;
}

/**
 * Converts clean DatasetItemFilters object to FilterState array
 * for use with tableColumnsToSqlFilterAndPrefix
 */
export function convertFiltersToFilterState(
  filters: DatasetItemFilters,
): FilterState {
  const filterState: FilterState = [];

  if (filters.datasetIds && filters.datasetIds.length > 0) {
    filterState.push({
      type: "stringOptions",
      column: "datasetId",
      operator: "any of",
      value: filters.datasetIds,
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
 * Builds the SQL query for fetching latest dataset items.
 * Uses DISTINCT ON to get the most recent version (by validFrom DESC) for each (id, projectId).
 * Excludes soft-deleted items (isDeleted = true).
 *
 * @param projectId - Project ID
 * @param includeIO - Whether to include input/output/metadata fields in SELECT
 * @param includeDatasetName - Whether to JOIN datasets table and include dataset name
 * @param filter - FilterState array for filtering (includes datasetId, status, etc.)
 * @param limit - Optional LIMIT for pagination
 * @param offset - Optional OFFSET for pagination
 * @returns Prisma.Sql query
 */
function buildDatasetItemsLatestQuery(
  projectId: string,
  includeIO: boolean,
  includeDatasetName: boolean,
  filter: FilterState,
  limit?: number,
  offset?: number,
): Prisma.Sql {
  const ioFields = includeIO
    ? Prisma.sql`input, expected_output, metadata,`
    : Prisma.empty;

  const datasetJoin = includeDatasetName
    ? Prisma.sql`LEFT JOIN datasets d ON li.dataset_id = d.id AND li.project_id = d.project_id`
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
    WITH latest_items AS (
      SELECT DISTINCT ON (id, project_id)
        id,
        project_id,
        dataset_id,
        ${ioFields}
        source_trace_id,
        source_observation_id,
        status,
        created_at,
        updated_at,        valid_from,
        is_deleted
      FROM dataset_items
      WHERE project_id = ${projectId}
      ${filterCondition}
      ORDER BY id, project_id, valid_from DESC
    )
    SELECT
      li.id,
      li.project_id,
      li.dataset_id,
      ${ioFields}
      li.source_trace_id,
      li.source_observation_id,
      li.status,
      li.created_at,
      li.updated_at
      ${datasetNameField}
    FROM latest_items li
    ${datasetJoin}
    WHERE li.is_deleted = false
    ORDER BY li.valid_from DESC
    ${paginationClause}
  `;
}

/**
 * Builds the SQL query for counting latest dataset items.
 * Same logic as buildDatasetItemsLatestQuery but returns COUNT(*) instead.
 */
function buildDatasetItemsLatestCountQuery(
  projectId: string,
  filter: FilterState,
): Prisma.Sql {
  const filterCondition = tableColumnsToSqlFilterAndPrefix(
    filter,
    datasetItemsFilterCols,
    "dataset_item_events",
  );

  return Prisma.sql`
    WITH latest_items AS (
      SELECT DISTINCT ON (id, project_id)
        id,
        project_id,
        dataset_id,
        source_trace_id,
        source_observation_id,
        status,
        created_at,
        updated_at,
        is_deleted
      FROM dataset_items
      WHERE project_id = ${projectId}
      ${filterCondition}
      ORDER BY id, project_id, valid_from DESC
    )
    SELECT COUNT(*) as count
    FROM latest_items li
    WHERE li.is_deleted = false
  `;
}

/**
 * Converts a raw database row from dataset_items table to Domain types
 */
function convertLatestRowToDomain<
  IncludeIO extends boolean = true,
  IncludeDatasetName extends boolean = false,
>(
  row: QueryGetLatestDatasetItemRow,
  includeIO: IncludeIO,
  includeDatasetName: IncludeDatasetName,
): IncludeIO extends true
  ? IncludeDatasetName extends true
    ? DatasetItemDomain & { datasetName: string }
    : DatasetItemDomain
  : IncludeDatasetName extends true
    ? DatasetItemDomainWithoutIO & { datasetName: string }
    : DatasetItemDomainWithoutIO {
  const base: DatasetItemDomainWithoutIO = {
    id: row.id,
    projectId: row.project_id,
    datasetId: row.dataset_id,
    sourceTraceId: row.source_trace_id,
    sourceObservationId: row.source_observation_id,
    status: row.status ?? DatasetStatus.ACTIVE,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  const withIO = includeIO
    ? {
        ...base,
        input: row.input ?? null,
        expectedOutput: row.expected_output ?? null,
        metadata: row.metadata ?? null,
      }
    : base;

  const withDatasetName = includeDatasetName
    ? { ...withIO, datasetName: row.dataset_name! }
    : withIO;

  return withDatasetName as any;
}

/**
 * Counts dataset items at a specific version timestamp.
 * Uses the same logic as getDatasetItemsByVersion but returns only the count.
 *
 * @param params.filters - Optional filters to apply (defaults to ACTIVE status)
 * @returns Number of items matching filters at the specified version
 */
/**
 * Internal function to get latest dataset items using raw SQL.
 * Returns DatasetItemDomain objects with optional IO fields.
 */
async function getDatasetItemsByLatestInternal<
  IncludeIO extends boolean,
  IncludeDatasetName extends boolean = false,
>(params: {
  projectId: string;
  includeIO: IncludeIO;
  includeDatasetName?: IncludeDatasetName;
  filter: FilterState;
  limit?: number;
  offset?: number;
}): Promise<
  IncludeIO extends true
    ? IncludeDatasetName extends true
      ? Array<DatasetItemDomain & { datasetName: string }>
      : DatasetItemDomain[]
    : IncludeDatasetName extends true
      ? Array<DatasetItemDomainWithoutIO & { datasetName: string }>
      : DatasetItemDomainWithoutIO[]
> {
  const query = buildDatasetItemsLatestQuery(
    params.projectId,
    params.includeIO,
    params.includeDatasetName ?? false,
    params.filter,
    params.limit,
    params.offset,
  );

  const result = await prisma.$queryRaw<QueryGetLatestDatasetItemRow[]>(query);

  const items = result.map((row) =>
    convertLatestRowToDomain(
      row,
      params.includeIO,
      params.includeDatasetName ?? false,
    ),
  );

  return items as any;
}

/**
 * Internal function to count latest dataset items using raw SQL.
 */
async function getDatasetItemsCountByLatestInternal(params: {
  projectId: string;
  filters?: DatasetItemFilters;
}): Promise<number> {
  const filtersWithDefaults = applyDefaultFilters(params.filters);
  const filterState = convertFiltersToFilterState(filtersWithDefaults);

  const query = buildDatasetItemsLatestCountQuery(
    params.projectId,
    filterState,
  );

  const result = await prisma.$queryRaw<Array<{ count: bigint }>>(query);

  return result.length > 0 ? Number(result[0].count) : 0;
}

/**
 * Retrieves a single dataset item by ID.
 * Always returns the latest version of the item.
 * Used by API layers to fetch current state before merging partial updates.
 *
 * @param props.datasetId - Optional to ensure item belongs to correct dataset
 * @param props.status - Filter by status ('ACTIVE' for active items only, 'ALL' to include archived items)
 * @returns The dataset item or null if not found/deleted
 */
export async function getDatasetItemById<
  IncludeIO extends boolean = true,
>(props: {
  projectId: string;
  datasetItemId: string;
  status: "ACTIVE" | "ALL";
  datasetId?: string;
  includeIO?: IncludeIO;
}): Promise<
  | (IncludeIO extends true ? DatasetItemDomain : DatasetItemDomainWithoutIO)
  | null
> {
  const status = props.status;
  const includeIO = (props.includeIO ?? true) as IncludeIO;

  return executeWithDatasetServiceStrategy(OperationType.READ, {
    [Implementation.STATEFUL]: async () => {
      // OLD: Simple lookup in dataset_items
      const item = await prisma.datasetItem.findUnique({
        select: includeIO
          ? undefined
          : {
              id: true,
              projectId: true,
              datasetId: true,
              sourceTraceId: true,
              sourceObservationId: true,
              status: true,
              createdAt: true,
              updatedAt: true,
            },
        where: {
          id_projectId: {
            id: props.datasetItemId,
            projectId: props.projectId,
          },
          ...(props.datasetId ? { datasetId: props.datasetId } : {}),
          ...(status === "ACTIVE" && { status: DatasetStatus.ACTIVE }),
        },
      });
      return item ? toDomainType(item, includeIO) : null;
    },
    [Implementation.VERSIONED]: async () => {
      // NEW: Get latest version from dataset_items by validFrom DESC
      const item = await prisma.datasetItem.findFirst({
        select: includeIO
          ? undefined
          : {
              id: true,
              projectId: true,
              datasetId: true,
              sourceTraceId: true,
              sourceObservationId: true,
              status: true,
              createdAt: true,
              updatedAt: true,
            },
        where: {
          id: props.datasetItemId,
          projectId: props.projectId,
          ...(props.datasetId ? { datasetId: props.datasetId } : {}),
          ...(status === "ACTIVE" && { status: DatasetStatus.ACTIVE }),
        },
        orderBy: {
          validFrom: "desc",
        },
      });

      // If latest version is deleted, return null
      if (!item || item.isDeleted) {
        return null;
      }

      return toDomainType(item, includeIO);
    },
  });
}

/**
 * Retrieves the latest version of dataset items.
 * For each unique item ID, returns the latest non-deleted version.
 */
export async function getDatasetItemsByLatest<
  IncludeIO extends boolean = true,
  IncludeDatasetName extends boolean = false,
>(props: {
  projectId: string;
  includeIO?: IncludeIO;
  includeDatasetName?: IncludeDatasetName;
  filters?: DatasetItemFilters;
  limit?: number;
  page?: number;
}): Promise<
  IncludeIO extends true
    ? IncludeDatasetName extends true
      ? Array<DatasetItemDomain & { datasetName: string }>
      : DatasetItemDomain[]
    : IncludeDatasetName extends true
      ? Array<DatasetItemDomainWithoutIO & { datasetName: string }>
      : DatasetItemDomainWithoutIO[]
> {
  const includeIO = (props.includeIO ?? true) as IncludeIO;
  const offset =
    props.limit !== undefined && props.page !== undefined
      ? props.page * props.limit
      : undefined;

  return executeWithDatasetServiceStrategy(OperationType.READ, {
    [Implementation.STATEFUL]: async () => {
      const defaultFilters = props.filters ?? {};
      const status = defaultFilters.status ?? "ACTIVE";
      const includeDatasetName = props.includeDatasetName ?? false;

      const selectFields = includeIO
        ? undefined
        : {
            id: true,
            projectId: true,
            datasetId: true,
            sourceTraceId: true,
            sourceObservationId: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          };

      const items = await prisma.datasetItem.findMany({
        where: {
          projectId: props.projectId,
          ...(defaultFilters.datasetIds &&
            defaultFilters.datasetIds.length > 0 && {
              datasetId: { in: defaultFilters.datasetIds },
            }),
          ...(status === "ACTIVE" && { status: DatasetStatus.ACTIVE }),
          ...(defaultFilters.itemIds && {
            id: { in: defaultFilters.itemIds },
          }),
          ...(defaultFilters.sourceTraceId !== undefined && {
            sourceTraceId: defaultFilters.sourceTraceId,
          }),
          ...(defaultFilters.sourceObservationId !== undefined && {
            sourceObservationId: defaultFilters.sourceObservationId,
          }),
        },
        ...(selectFields && { select: selectFields }),
        ...(props.limit !== undefined && { take: props.limit }),
        ...(offset !== undefined && { skip: offset }),
        orderBy: { createdAt: "desc" },
        ...(includeDatasetName && {
          include: { dataset: { select: { name: true } } },
        }),
      });

      return items.map((item) =>
        toDomainType(item, includeIO, includeDatasetName),
      ) as any;
    },
    [Implementation.VERSIONED]: async () => {
      const filtersWithDefaults = applyDefaultFilters(props.filters);
      const filterState = convertFiltersToFilterState(filtersWithDefaults);

      return getDatasetItemsByLatestInternal({
        projectId: props.projectId,
        includeIO,
        includeDatasetName: props.includeDatasetName,
        filter: filterState,
        limit: props.limit,
        offset,
      });
    },
  });
}

export async function getDatasetItemsCountByLatest(props: {
  projectId: string;
  filters?: DatasetItemFilters;
}): Promise<number> {
  return executeWithDatasetServiceStrategy(OperationType.READ, {
    [Implementation.STATEFUL]: async () => {
      const defaultFilters = props.filters ?? {};
      const status = defaultFilters.status ?? "ACTIVE";

      return await prisma.datasetItem.count({
        where: {
          projectId: props.projectId,
          ...(defaultFilters.datasetIds &&
            defaultFilters.datasetIds.length > 0 && {
              datasetId: { in: defaultFilters.datasetIds },
            }),
          ...(status === "ACTIVE" && { status: DatasetStatus.ACTIVE }),
          ...(defaultFilters.itemIds && {
            id: { in: defaultFilters.itemIds },
          }),
          ...(defaultFilters.sourceTraceId !== undefined && {
            sourceTraceId: defaultFilters.sourceTraceId,
          }),
          ...(defaultFilters.sourceObservationId !== undefined && {
            sourceObservationId: defaultFilters.sourceObservationId,
          }),
        },
      });
    },
    [Implementation.VERSIONED]: async () => {
      return getDatasetItemsCountByLatestInternal({
        projectId: props.projectId,
        filters: props.filters,
      });
    },
  });
}
