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
 * Automatically excludes version columns (validFrom, isDeleted).
 */
function toDomainType<
  IncludeIO extends boolean = true,
  IncludeDatasetName extends boolean = false,
>(
  item: DatasetItem & { dataset?: { name: string } },
  includeIO: IncludeIO = true as IncludeIO,
  includeDatasetName: IncludeDatasetName = false as IncludeDatasetName,
): IncludeIO extends true
  ? IncludeDatasetName extends true
    ? DatasetItemDomain & { datasetName: string }
    : DatasetItemDomain
  : IncludeDatasetName extends true
    ? DatasetItemDomainWithoutIO & { datasetName: string }
    : DatasetItemDomainWithoutIO {
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
 * Validates all items before insertion - if any fail, none are inserted (unless allowPartialSuccess is true).
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
 * @param props.allowPartialSuccess - If true, create valid items even if some fail validation.
 *   When enabled, the return type changes:
 *   - `success: true` with `validationErrors` array (partial success)
 *   - `successCount` and `failedCount` indicate how many items were created vs failed
 * @returns When allowPartialSuccess=false: success with all items OR failure with all errors.
 *          When allowPartialSuccess=true: success with created items AND any validation errors.
 */
export async function createManyDatasetItems(props: {
  projectId: string;
  items: CreateManyItemsPayload;
  normalizeOpts: { sanitizeControlChars?: boolean };
  validateOpts: { normalizeUndefinedToNull?: boolean };
  allowPartialSuccess?: boolean;
}): Promise<
  | {
      success: true;
      datasetItems: CreateManyItemsInsert;
      validationErrors?: CreateManyValidationError[];
      successCount: number;
      failedCount: number;
    }
  | {
      success: false;
      validationErrors: CreateManyValidationError[];
      successCount: number;
      failedCount: number;
    }
> {
  let successCount = 0;
  let failedCount = 0;

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
        failedCount++;

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
        successCount++;

        // Validation passed - prepare for insert
        preparedItems.push({
          id: item.id ?? v4(),
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

  // 4. If any validation errors and partial success not allowed, return early
  if (validationErrors.length > 0 && !props.allowPartialSuccess) {
    return {
      success: false,
      validationErrors,
      successCount,
      failedCount,
    };
  }

  // 5. Bulk insert all valid items
  if (preparedItems.length > 0) {
    await prisma.datasetItem.createMany({
      data: preparedItems,
    });
  }

  // 6. Return appropriate response
  if (validationErrors.length > 0 && props.allowPartialSuccess) {
    // Partial success: some items created, some failed
    return {
      success: true,
      datasetItems: preparedItems,
      validationErrors,
      successCount,
      failedCount,
    };
  }

  return {
    success: true,
    datasetItems: preparedItems,
    successCount,
    failedCount,
  };
}

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
  id?: string;
  input?: string | unknown | null;
  expectedOutput?: string | unknown | null;
  metadata?: string | unknown | null;
  sourceTraceId?: string;
  sourceObservationId?: string;
}[];

export type CreateManyItemsInsert = {
  id: string;
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
 * Raw database row for getting latest dataset items from dataset_items table
 */
/**
 * Raw database row for getting latest dataset items from dataset_items table
 */
type QueryGetLatestDatasetItemRow = {
  id: string;
  project_id: string;
  dataset_id: string;
  input?: Prisma.JsonValue | null;
  expected_output?: Prisma.JsonValue | null;
  metadata?: Prisma.JsonValue | null;
  source_trace_id: string | null;
  source_observation_id: string | null;
  status: DatasetStatus;
  created_at: Date;
  updated_at: Date;
  dataset_name?: string;
};

/**
 * Helper to create FilterState for common dataset item filtering use cases.
 * Use this when you need simple filters. For complex filters, construct FilterState directly.
 *
 * @example
 * const filterState = createDatasetItemFilterState({
 *   datasetIds: ["dataset-1"],
 *   status: "ACTIVE",
 * });
 */
export function createDatasetItemFilterState(options: {
  datasetIds?: string[];
  itemIds?: string[];
  sourceTraceId?: string;
  sourceObservationId?: string;
  sourceObservationIdIsNull?: boolean;
  status?: "ACTIVE" | "ALL";
}): FilterState {
  const filterState: FilterState = [];

  if (options.datasetIds && options.datasetIds.length > 0) {
    filterState.push({
      type: "stringOptions",
      column: "datasetId",
      operator: "any of",
      value: options.datasetIds,
    });
  }

  if (options.itemIds && options.itemIds.length > 0) {
    filterState.push({
      type: "stringOptions",
      column: "id",
      operator: "any of",
      value: options.itemIds,
    });
  }

  if (options.sourceTraceId !== undefined) {
    filterState.push({
      type: "string",
      column: "sourceTraceId",
      operator: "=",
      value: options.sourceTraceId,
    });
  }

  if (options.sourceObservationId !== undefined) {
    filterState.push({
      type: "string",
      column: "sourceObservationId",
      operator: "=",
      value: options.sourceObservationId,
    });
  }

  if (options.sourceObservationIdIsNull === true) {
    filterState.push({
      type: "null",
      column: "sourceObservationId",
      operator: "is null",
      value: "",
    });
  }

  if (options.status === "ACTIVE") {
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
 * Converts FilterState to Prisma where clause for STATEFUL mode.
 * This is a temporary helper for the deprecated STATEFUL implementation.
 * VERSIONED mode uses SQL directly and doesn't need this.
 */
function buildPrismaWhereFromFilterState(filterState: FilterState): any {
  const where: any = {};

  for (const filter of filterState) {
    switch (filter.column) {
      case "datasetId":
        if (filter.type === "stringOptions" && filter.value.length > 0) {
          where.datasetId = { in: filter.value };
        }
        break;
      case "id":
        if (filter.type === "stringOptions" && filter.value.length > 0) {
          where.id = { in: filter.value };
        }
        break;
      case "sourceTraceId":
        if (filter.type === "null" && filter.operator === "is null") {
          where.sourceTraceId = null;
        } else if (filter.type === "string") {
          where.sourceTraceId = filter.value;
        }
        break;
      case "sourceObservationId":
        if (filter.type === "null" && filter.operator === "is null") {
          where.sourceObservationId = null;
        } else if (filter.type === "string") {
          where.sourceObservationId = filter.value;
        }
        break;
      case "status":
        if (filter.type === "stringOptions" && filter.value.length > 0) {
          where.status = { in: filter.value.map((v) => v as DatasetStatus) };
        }
        break;
      case "createdAt":
        if (filter.type === "datetime") {
          where.createdAt = { lte: filter.value };
        }
        break;
      // metadata filters are not supported in Prisma path (need raw SQL)
    }
  }

  return where;
}

/**
 * Builds SQL search filter for full-text search on dataset items.
 * Applies ILIKE search on id, input, expectedOutput, and metadata fields.
 * Returns Prisma.empty if no search query provided.
 *
 * @param tableAlias - The table alias to use (default 'di' for dataset items)
 */
function buildDatasetItemSearchCondition(
  searchQuery?: string,
  searchType?: ("id" | "content")[],
  tableAlias: string = "di",
): Prisma.Sql {
  if (!searchQuery || searchQuery === "") {
    return Prisma.empty;
  }

  const types = searchType ?? ["content"];
  const searchConditions: Prisma.Sql[] = [];

  if (types.includes("id")) {
    searchConditions.push(
      Prisma.sql`${Prisma.raw(tableAlias)}.id ILIKE ${`%${searchQuery}%`}`,
    );
  }

  if (types.includes("content")) {
    searchConditions.push(
      Prisma.sql`${Prisma.raw(tableAlias)}.input::text ILIKE ${`%${searchQuery}%`}`,
    );
    searchConditions.push(
      Prisma.sql`${Prisma.raw(tableAlias)}.expected_output::text ILIKE ${`%${searchQuery}%`}`,
    );
    searchConditions.push(
      Prisma.sql`${Prisma.raw(tableAlias)}.metadata::text ILIKE ${`%${searchQuery}%`}`,
    );
  }

  return searchConditions.length > 0
    ? Prisma.sql` AND (${Prisma.join(searchConditions, " OR ")})`
    : Prisma.empty;
}

/**
 * Builds SQL query for STATEFUL dataset items with search support.
 * Simple direct query without version logic.
 */
function buildStatefulDatasetItemsQuery(
  projectId: string,
  includeIO: boolean,
  includeDatasetName: boolean,
  filter: FilterState,
  searchQuery?: string,
  searchType?: ("id" | "content")[],
  limit?: number,
  offset?: number,
): Prisma.Sql {
  const ioFields = includeIO
    ? Prisma.sql`di.input, di.expected_output, di.metadata,`
    : Prisma.empty;

  const datasetJoin = includeDatasetName
    ? Prisma.sql`LEFT JOIN datasets d ON di.dataset_id = d.id AND di.project_id = d.project_id`
    : Prisma.empty;

  const datasetNameField = includeDatasetName
    ? Prisma.sql`, d.name as dataset_name`
    : Prisma.empty;

  const filterCondition = tableColumnsToSqlFilterAndPrefix(
    filter,
    datasetItemsFilterCols,
    "dataset_item_events",
  );

  const searchCondition = buildDatasetItemSearchCondition(
    searchQuery,
    searchType,
    "di",
  );

  const paginationClause =
    limit !== undefined
      ? Prisma.sql`LIMIT ${limit}${offset !== undefined ? Prisma.sql` OFFSET ${offset}` : Prisma.empty}`
      : Prisma.empty;

  return Prisma.sql`
    SELECT
      di.id,
      di.project_id,
      di.dataset_id,
      ${ioFields}
      di.source_trace_id,
      di.source_observation_id,
      di.status,
      di.created_at,
      di.updated_at
      ${datasetNameField}
    FROM dataset_items di
    ${datasetJoin}
    WHERE di.project_id = ${projectId}
    ${filterCondition}
    ${searchCondition}
    ORDER BY di.created_at DESC, di.id ASC
    ${paginationClause}
  `;
}

/**
 * Builds SQL count query for STATEFUL dataset items with search support.
 */
function buildStatefulDatasetItemsCountQuery(
  projectId: string,
  filter: FilterState,
  searchQuery?: string,
  searchType?: ("id" | "content")[],
): Prisma.Sql {
  const filterCondition = tableColumnsToSqlFilterAndPrefix(
    filter,
    datasetItemsFilterCols,
    "dataset_item_events",
  );

  const searchCondition = buildDatasetItemSearchCondition(
    searchQuery,
    searchType,
    "di",
  );

  return Prisma.sql`
    SELECT COUNT(*) as count
    FROM dataset_items di
    WHERE di.project_id = ${projectId}
    ${filterCondition}
    ${searchCondition}
  `;
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
 * @param searchQuery - Optional full-text search query
 * @param searchType - Optional search types (id, content)
 * @param limit - Optional LIMIT for pagination
 * @param offset - Optional OFFSET for pagination
 * @returns Prisma.Sql query
 */
function buildDatasetItemsLatestQuery(
  projectId: string,
  includeIO: boolean,
  includeDatasetName: boolean,
  filter: FilterState,
  searchQuery?: string,
  searchType?: ("id" | "content")[],
  limit?: number,
  offset?: number,
): Prisma.Sql {
  const ioFieldsCTE = includeIO
    ? Prisma.sql`di.input, di.expected_output, di.metadata,`
    : Prisma.empty;

  const ioFieldsOuter = includeIO
    ? Prisma.sql`di.input, di.expected_output, di.metadata,`
    : Prisma.empty;

  const datasetJoin = includeDatasetName
    ? Prisma.sql`LEFT JOIN datasets d ON di.dataset_id = d.id AND di.project_id = d.project_id`
    : Prisma.empty;

  const datasetNameField = includeDatasetName
    ? Prisma.sql`, d.name as dataset_name`
    : Prisma.empty;

  const filterCondition = tableColumnsToSqlFilterAndPrefix(
    filter,
    datasetItemsFilterCols,
    "dataset_item_events",
  );

  const searchCondition = buildDatasetItemSearchCondition(
    searchQuery,
    searchType,
  );

  const paginationClause =
    limit !== undefined
      ? Prisma.sql`LIMIT ${limit}${offset !== undefined ? Prisma.sql` OFFSET ${offset}` : Prisma.empty}`
      : Prisma.empty;

  return Prisma.sql`
    WITH latest_items AS (
      SELECT DISTINCT ON (di.id)
        di.id,
        di.project_id,
        di.dataset_id,
        ${ioFieldsCTE}
        di.source_trace_id,
        di.source_observation_id,
        di.status,
        di.created_at,
        di.updated_at,
        di.valid_from,
        di.is_deleted
      FROM dataset_items di
      WHERE di.project_id = ${projectId}
      ${filterCondition}
      ORDER BY di.id, di.valid_from DESC
    )
    SELECT
      di.id,
      di.project_id,
      di.dataset_id,
      ${ioFieldsOuter}
      di.source_trace_id,
      di.source_observation_id,
      di.status,
      di.created_at,
      di.updated_at
      ${datasetNameField}
    FROM latest_items di
    ${datasetJoin}
    WHERE di.is_deleted = false
    ${searchCondition}
    ORDER BY di.valid_from DESC, di.id ASC
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
  searchQuery?: string,
  searchType?: ("id" | "content")[],
): Prisma.Sql {
  const filterCondition = tableColumnsToSqlFilterAndPrefix(
    filter,
    datasetItemsFilterCols,
    "dataset_item_events",
  );

  const searchCondition = buildDatasetItemSearchCondition(
    searchQuery,
    searchType,
  );

  return Prisma.sql`
    WITH latest_items AS (
      SELECT DISTINCT ON (di.id)
        di.id,
        di.project_id,
        di.dataset_id,
        di.input,
        di.expected_output,
        di.metadata,
        di.source_trace_id,
        di.source_observation_id,
        di.status,
        di.created_at,
        di.updated_at,
        di.is_deleted
      FROM dataset_items di
      WHERE di.project_id = ${projectId}
      ${filterCondition}
      ORDER BY di.id, di.valid_from DESC
    )
    SELECT COUNT(*) as count
    FROM latest_items di
    WHERE di.is_deleted = false
    ${searchCondition}
  `;
}

/**
 * Builds the SQL query for counting latest dataset items grouped by dataset_id.
 */
function buildDatasetItemsLatestCountGroupedQuery(
  projectId: string,
  datasetIds: string[],
): Prisma.Sql {
  return Prisma.sql`
    WITH latest_items AS (
      SELECT DISTINCT ON (di.id)
        di.id,
        di.project_id,
        di.dataset_id,
        di.status,
        di.is_deleted
      FROM dataset_items di
      WHERE di.project_id = ${projectId}
        AND di.dataset_id = ANY(${datasetIds})
      ORDER BY di.id, di.valid_from DESC
    )
    SELECT
      di.dataset_id,
      COUNT(*) as count
    FROM latest_items di
    WHERE di.is_deleted = false
      AND di.status = 'ACTIVE'
    GROUP BY di.dataset_id
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
  searchQuery?: string;
  searchType?: ("id" | "content")[];
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
    params.searchQuery,
    params.searchType,
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
  filterState: FilterState;
  searchQuery?: string;
  searchType?: ("id" | "content")[];
}): Promise<number> {
  const query = buildDatasetItemsLatestCountQuery(
    params.projectId,
    params.filterState,
    params.searchQuery,
    params.searchType,
  );

  const result = await prisma.$queryRaw<Array<{ count: bigint }>>(query);

  return result.length > 0 ? Number(result[0].count) : 0;
}

/**
 * Internal function to count latest dataset items grouped by dataset_id using raw SQL.
 */
async function getDatasetItemsCountByLatestGroupedInternal(params: {
  projectId: string;
  datasetIds: string[];
}): Promise<Array<{ datasetId: string; count: number }>> {
  const query = buildDatasetItemsLatestCountGroupedQuery(
    params.projectId,
    params.datasetIds,
  );

  const result =
    await prisma.$queryRaw<Array<{ dataset_id: string; count: bigint }>>(query);

  return result.map((row) => ({
    datasetId: row.dataset_id,
    count: Number(row.count),
  }));
}

/**
 * Retrieves a single dataset item by ID.
 * Always returns the latest version of the item.
 * Used by API layers to fetch current state before merging partial updates.
 *
 * @param props.datasetId - Optional to ensure item belongs to correct dataset
 * @param props.status - Optional status filter: 'ACTIVE' for active items only, undefined (default) for all statuses
 * @returns The dataset item or null if not found/deleted
 */
export async function getDatasetItemById<
  IncludeIO extends boolean = true,
>(props: {
  projectId: string;
  datasetItemId: string;
  status?: "ACTIVE";
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
      // Get latest version using raw SQL with subquery to filter after ordering
      const selectFields = includeIO
        ? 'id, project_id AS "projectId", dataset_id AS "datasetId", input, expected_output AS "expectedOutput", metadata, source_trace_id AS "sourceTraceId", source_observation_id AS "sourceObservationId", status, created_at AS "createdAt", updated_at AS "updatedAt"'
        : 'id, project_id AS "projectId", dataset_id AS "datasetId", source_trace_id AS "sourceTraceId", source_observation_id AS "sourceObservationId", status, created_at AS "createdAt", updated_at AS "updatedAt"';

      const datasetFilter = props.datasetId
        ? Prisma.sql`AND dataset_id = ${props.datasetId}`
        : Prisma.empty;

      const statusFilter =
        status === "ACTIVE"
          ? Prisma.sql`AND status = ${DatasetStatus.ACTIVE}`
          : Prisma.empty;

      const result = await prisma.$queryRaw<DatasetItem[]>(
        Prisma.sql`
          SELECT ${Prisma.raw(selectFields)}
          FROM (
            SELECT *
            FROM dataset_items
            WHERE project_id = ${props.projectId}
              AND id = ${props.datasetItemId}
              ${datasetFilter}
            ORDER BY valid_from DESC
            LIMIT 1
          ) latest
          WHERE is_deleted = false
            ${statusFilter}
        `,
      );

      const item = result[0];
      return item ? toDomainType(item, includeIO) : null;
    },
  });
}

/**
 * Retrieves the latest version of dataset items.
 * For each unique item ID, returns the latest non-deleted version.
 *
 * @param filterState - FilterState array for filtering (use createDatasetItemFilterState for simple cases)
 * @param searchQuery - Optional full-text search query (searches id, input, expectedOutput, metadata)
 * @param searchType - Search types: ["id"], ["content"], or ["id", "content"]
 */
export async function getDatasetItemsByLatest<
  IncludeIO extends boolean = true,
  IncludeDatasetName extends boolean = false,
>(props: {
  projectId: string;
  filterState: FilterState;
  searchQuery?: string;
  searchType?: ("id" | "content")[];
  includeIO?: IncludeIO;
  includeDatasetName?: IncludeDatasetName;
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
  const includeDatasetName = props.includeDatasetName ?? false;
  const offset =
    props.limit !== undefined && props.page !== undefined
      ? props.page * props.limit
      : undefined;

  return executeWithDatasetServiceStrategy(OperationType.READ, {
    [Implementation.STATEFUL]: async () => {
      // STATEFUL: Use raw SQL if search or metadata filters are present
      const hasSearch = props.searchQuery && props.searchQuery !== "";
      const hasMetadataFilter = props.filterState.some(
        (f) => f.column === "metadata" && f.type === "stringObject",
      );

      if (hasSearch || hasMetadataFilter) {
        const query = buildStatefulDatasetItemsQuery(
          props.projectId,
          includeIO,
          includeDatasetName,
          props.filterState,
          props.searchQuery,
          props.searchType,
          props.limit,
          offset,
        );

        const result =
          await prisma.$queryRaw<QueryGetLatestDatasetItemRow[]>(query);

        return result.map((row) =>
          convertLatestRowToDomain(row, includeIO, includeDatasetName),
        ) as any;
      }

      // Otherwise use Prisma
      const where = {
        projectId: props.projectId,
        ...buildPrismaWhereFromFilterState(props.filterState),
      };

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
        where,
        ...(selectFields && { select: selectFields }),
        ...(props.limit !== undefined && { take: props.limit }),
        ...(offset !== undefined && { skip: offset }),
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        ...(includeDatasetName && {
          include: { dataset: { select: { name: true } } },
        }),
      });

      return items.map((item) =>
        toDomainType(item, includeIO, includeDatasetName),
      ) as any;
    },
    [Implementation.VERSIONED]: async () => {
      // VERSIONED: FilterState → SQL directly
      return getDatasetItemsByLatestInternal({
        projectId: props.projectId,
        includeIO,
        includeDatasetName,
        filter: props.filterState,
        searchQuery: props.searchQuery,
        searchType: props.searchType,
        limit: props.limit,
        offset,
      });
    },
  });
}

/**
 * Counts the latest version of dataset items matching the filter.
 *
 * @param filterState - FilterState array for filtering (use createDatasetItemFilterState for simple cases)
 * @param searchQuery - Optional full-text search query
 * @param searchType - Search types: ["id"], ["content"], or ["id", "content"]
 */
export async function getDatasetItemsCountByLatest(props: {
  projectId: string;
  filterState: FilterState;
  searchQuery?: string;
  searchType?: ("id" | "content")[];
}): Promise<number> {
  return executeWithDatasetServiceStrategy(OperationType.READ, {
    [Implementation.STATEFUL]: async () => {
      // STATEFUL: Use raw SQL if search or metadata filters are present
      const hasSearch = props.searchQuery && props.searchQuery !== "";
      const hasMetadataFilter = props.filterState.some(
        (f) => f.column === "metadata" && f.type === "stringObject",
      );

      if (hasSearch || hasMetadataFilter) {
        const query = buildStatefulDatasetItemsCountQuery(
          props.projectId,
          props.filterState,
          props.searchQuery,
          props.searchType,
        );

        const result = await prisma.$queryRaw<Array<{ count: bigint }>>(query);
        return result.length > 0 ? Number(result[0].count) : 0;
      }

      // Otherwise use Prisma
      const where = {
        projectId: props.projectId,
        ...buildPrismaWhereFromFilterState(props.filterState),
      };

      return await prisma.datasetItem.count({ where });
    },
    [Implementation.VERSIONED]: async () => {
      // VERSIONED: FilterState → SQL directly
      return getDatasetItemsCountByLatestInternal({
        projectId: props.projectId,
        filterState: props.filterState,
        searchQuery: props.searchQuery,
        searchType: props.searchType,
      });
    },
  });
}

export async function getDatasetItemsCountByLatestGrouped(props: {
  projectId: string;
  datasetIds: string[];
}): Promise<Array<{ datasetId: string; count: number }>> {
  return executeWithDatasetServiceStrategy(OperationType.READ, {
    [Implementation.STATEFUL]: async () => {
      const results = await prisma.datasetItem.groupBy({
        by: ["datasetId"],
        where: {
          projectId: props.projectId,
          datasetId: { in: props.datasetIds },
          status: DatasetStatus.ACTIVE, // Filter by ACTIVE status to match VERSIONED
        },
        _count: true,
      });

      return results.map((r) => ({
        datasetId: r.datasetId,
        count: r._count,
      }));
    },
    [Implementation.VERSIONED]: async () => {
      const results = await getDatasetItemsCountByLatestGroupedInternal({
        projectId: props.projectId,
        datasetIds: props.datasetIds,
      });
      return results;
    },
  });
}
