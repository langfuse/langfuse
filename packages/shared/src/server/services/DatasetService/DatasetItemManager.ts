import { v4 } from "uuid";
import { Dataset, DatasetItem, DatasetStatus, prisma } from "../../../db";
import { LangfuseNotFoundError } from "../../../errors/NotFoundError";
import { DatasetItemValidator } from "./DatasetItemValidator";
import type {
  CreateManyItemsInsert,
  CreateManyItemsPayload,
  CreateManyValidationError,
  PayloadError,
} from "./types";
import {
  Implementation,
  executeWithDatasetServiceStrategy,
  OperationType,
  toPostgresDatasetItem,
} from "../../datasets/executeWithDatasetServiceStrategy";

type IdOrName = { datasetId: string } | { datasetName: string };

/**
 * Manager for dataset item CRUD operations.
 *
 * **Usage:** Use this class for all create/update/delete operations on dataset items.
 * Each operation validates items against dataset schemas before persisting.
 *
 * **Performance:** Uses DatasetItemValidator which compiles schemas once per operation,
 * providing 3800x+ speedup for batch operations compared to per-item compilation.
 *
 * @example
 * // Create single item
 * await DatasetItemManager.createItem({ projectId, datasetId, input, expectedOutput, ... });
 *
 * // Bulk create (CSV upload, API batch)
 * await DatasetItemManager.createManyItems({ projectId, items: [...], ... });
 *
 * // Upsert by ID or name
 * await DatasetItemManager.upsertItem({ projectId, datasetId, datasetItemId, ... });
 */
export class DatasetItemManager {
  private static async getDatasets(props: {
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

  private static async getDatasetById(props: {
    projectId: string;
    datasetId: string;
  }): Promise<Pick<Dataset, "id" | "inputSchema" | "expectedOutputSchema">> {
    const result = await this.getDatasets({
      projectId: props.projectId,
      datasetIds: [props.datasetId],
    });
    return result[0]!;
  }

  private static async getDatasetByName(props: {
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
   * Creates a single dataset item with validation.
   * Validates input/expectedOutput against dataset schemas before insertion.
   *
   * **Flexible input:** Accepts both JSON strings (tRPC) and objects (Public API).
   *
   * @returns Success with created item, or validation error with details
   */
  public static async createItem(props: {
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
    // Delegate to createManyItems with single item
    const result = await this.createManyItems({
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

  private static mergeItemData(
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

  /**
   * Upserts a dataset item (create if not exists, update if exists).
   * Validates against dataset schemas before persisting.
   *
   * **Flexible input:** Accepts both JSON strings (tRPC) and objects (Public API).
   *
   * @param props - Can identify dataset by ID or name
   * @returns Success with upserted item, or validation error with details
   */
  public static async upsertItem(
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
  ): Promise<
    | {
        success: true;
        datasetItem: DatasetItem;
      }
    | PayloadError
  > {
    // 1. Get dataset
    const dataset =
      "datasetId" in props
        ? await this.getDatasetById({
            projectId: props.projectId,
            datasetId: props.datasetId,
          })
        : await this.getDatasetByName({
            projectId: props.projectId,
            datasetName: props.datasetName,
          });

    const itemId = props.datasetItemId ?? v4();

    // 2. Fetch existing item if updating (itemId provided)
    // This ensures we validate and write the complete merged state
    let existingItem: DatasetItem | null = null;
    if (props.datasetItemId) {
      existingItem = await this.getItemById({
        projectId: props.projectId,
        datasetItemId: props.datasetItemId,
        datasetId: dataset.id,
      });
    }

    // 3. Merge incoming data with existing data
    // For fields where props value is undefined, use existing value
    const mergedItemData = existingItem
      ? this.mergeItemData(existingItem, props)
      : props;

    // 4. Validate merged payload
    const validator = new DatasetItemValidator({
      inputSchema: dataset.inputSchema as Record<string, unknown> | null,
      expectedOutputSchema: dataset.expectedOutputSchema as Record<
        string,
        unknown
      > | null,
    });

    const itemPayload = validator.preparePayload({
      input: mergedItemData.input,
      expectedOutput: mergedItemData.expectedOutput,
      metadata: mergedItemData.metadata,
      normalizeOpts: props.normalizeOpts,
      validateOpts: props.validateOpts,
    });

    if (!itemPayload.success) {
      return itemPayload;
    }

    // 5. Prepare full item data for writing
    const itemData = {
      itemId: itemId,
      input: itemPayload.input,
      expectedOutput: itemPayload.expectedOutput,
      metadata: itemPayload.metadata,
      sourceTraceId: mergedItemData.sourceTraceId ?? undefined,
      sourceObservationId: mergedItemData.sourceObservationId ?? undefined,
      status: mergedItemData.status ?? undefined,
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

        // Do not map to DatasetItem for return until we build out write execution path
        // item = {
        //   id: res.itemId,
        //   projectId: res.projectId,
        //   datasetId: res.datasetId,
        //   status: res.status ?? DatasetStatus.ACTIVE,
        //   input: res.input,
        //   expectedOutput: res.expectedOutput,
        //   metadata: res.metadata,
        //   sourceTraceId: res.sourceTraceId,
        //   sourceObservationId: res.sourceObservationId,
        //   createdAt: res.createdAt ?? new Date(),
        //   updatedAt: res.createdAt ?? new Date(),
        // };
      },
    });

    if (!item) {
      return {
        success: false,
        message: "Failed to upsert dataset item",
      };
    }

    return {
      success: true,
      datasetItem: item,
    };
  }

  /**
   * Deletes a dataset item by ID.
   *
   * @throws LangfuseNotFoundError if item doesn't exist
   */
  public static async deleteItem(props: {
    projectId: string;
    datasetItemId: string;
    datasetId?: string;
  }): Promise<{ success: true; deletedItem: DatasetItem }> {
    const item = await this.getItemById({
      projectId: props.projectId,
      datasetItemId: props.datasetItemId,
      datasetId: props.datasetId,
    });

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
   * Retrieves a single dataset item by ID.
   * Always returns the latest version of the item.
   * Used by API layers to fetch current state before merging partial updates.
   *
   * Call this BEFORE validation to merge existing data with updates.
   *
   * @param props.datasetId - Required to ensure item belongs to correct dataset
   * @returns The dataset item or null if not found
   */
  private static async getItemById(props: {
    projectId: string;
    datasetItemId: string;
    datasetId?: string;
  }): Promise<DatasetItem> {
    const item = await prisma.datasetItem.findUnique({
      where: {
        id_projectId: {
          id: props.datasetItemId,
          projectId: props.projectId,
        },
        ...(props.datasetId ? { datasetId: props.datasetId } : {}),
      },
    });
    if (!item) {
      throw new LangfuseNotFoundError(
        `Dataset item with id ${props.datasetItemId} not found for project ${props.projectId}`,
      );
    }
    return item;
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
  public static async createManyItems(props: {
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

    const result = await this.getDatasets({
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
        const result = validator.preparePayload({
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
}
