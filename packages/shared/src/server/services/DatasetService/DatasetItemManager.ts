import { v4 } from "uuid";
import { Dataset, DatasetItem, DatasetStatus, prisma } from "../../../db";
import { LangfuseNotFoundError } from "../../../errors/NotFoundError";
import { DatasetItemValidator } from "./DatasetItemValidator";
import type {
  CreateManyItemsInsert,
  CreateManyItemsPayload,
  CreateManyValidationError,
  ItemBase,
  ItemWithIO,
  PayloadError,
} from "./types";

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
  private static DEFAULT_OPTIONS = {
    includeIO: true,
    returnVersionTimestamp: false,
  };

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
  ): Promise<{ success: true; datasetItem: DatasetItem } | PayloadError> {
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

    // 2. Validate item payload
    const validator = new DatasetItemValidator({
      inputSchema: dataset.inputSchema as Record<string, unknown> | null,
      expectedOutputSchema: dataset.expectedOutputSchema as Record<
        string,
        unknown
      > | null,
    });

    const itemPayload = validator.preparePayload({
      input: props.input,
      expectedOutput: props.expectedOutput,
      metadata: props.metadata,
      normalizeOpts: props.normalizeOpts,
      validateOpts: props.validateOpts,
    });

    if (!itemPayload.success) {
      return itemPayload;
    }

    const itemId = props.datasetItemId ?? v4();

    // 3. Update item
    const datasetItem = await prisma.datasetItem.upsert({
      where: {
        id_projectId: {
          id: itemId,
          projectId: props.projectId,
        },
        datasetId: dataset.id,
      },
      create: {
        id: itemId,
        input: itemPayload.input,
        expectedOutput: itemPayload.expectedOutput,
        metadata: itemPayload.metadata,
        datasetId: dataset.id,
        sourceTraceId: props.sourceTraceId ?? undefined,
        sourceObservationId: props.sourceObservationId ?? undefined,
        status: props.status ?? undefined,
        projectId: props.projectId,
      },
      update: {
        input: itemPayload.input,
        expectedOutput: itemPayload.expectedOutput,
        metadata: itemPayload.metadata,
        sourceTraceId: props.sourceTraceId ?? undefined,
        sourceObservationId: props.sourceObservationId ?? undefined,
        status: props.status ?? undefined,
      },
    });

    return { success: true, datasetItem: datasetItem };
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
    const item = await prisma.datasetItem.findUnique({
      where: {
        id_projectId: { id: props.datasetItemId, projectId: props.projectId },
        ...(props.datasetId ? { datasetId: props.datasetId } : {}),
      },
    });
    if (!item) {
      throw new LangfuseNotFoundError(
        `Dataset item with id ${props.datasetItemId} not found for project ${props.projectId}`,
      );
    }

    await prisma.datasetItem.delete({
      where: {
        id_projectId: { id: props.datasetItemId, projectId: props.projectId },
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
            id: v4(),
            projectId: props.projectId,
            status: DatasetStatus.ACTIVE,
            datasetId: item.datasetId,
            input: result.input,
            expectedOutput: result.expectedOutput,
            metadata: result.metadata,
            sourceTraceId: item.sourceTraceId,
            sourceObservationId: item.sourceObservationId,
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
    await prisma.datasetItem.createMany({ data: preparedItems });

    return {
      success: true,
      datasetItems: preparedItems,
    };
  }

  private static convertRowToItem<IncludeIO extends boolean = true>(
    row: any,
    includeIO: IncludeIO,
  ): IncludeIO extends true ? ItemWithIO : ItemBase {
    const base: ItemBase = {
      id: row.id,
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

  private static async getItems<
    IncludeIO extends boolean,
    ReturnVersion extends boolean,
  >({
    projectId,
    datasetId,
    version,
    includeIO,
    returnVersionTimestamp,
  }: {
    projectId: string;
    datasetId: string;
    version: Date;
    includeIO: IncludeIO;
    returnVersionTimestamp: ReturnVersion;
  }): Promise<
    ReturnVersion extends true
      ? {
          items: Array<IncludeIO extends true ? ItemWithIO : ItemBase>;
          versionTimestamp: Date;
        }
      : Array<IncludeIO extends true ? ItemWithIO : ItemBase>
  > {
    const ioFields = includeIO ? "input, expected_output, metadata," : "";

    const versionField = returnVersionTimestamp
      ? ", MAX(created_at) OVER () as latest_version"
      : "";

    const result = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        input?: any;
        expected_output?: any;
        metadata?: any;
        source_trace_id: string | null;
        source_observation_id: string | null;
        status: string;
        created_at: Date | null;
        latest_version?: Date;
      }>
    >(
      `
    WITH latest_events AS (
      SELECT DISTINCT ON (id)
        id,
        ${ioFields}
        source_trace_id,
        source_observation_id,
        status,
        created_at,
        deleted_at
        ${versionField}
      FROM dataset_item_events
      WHERE project_id = ${projectId}
      AND dataset_id = ${datasetId}
      AND created_at <= ${version}
      ORDER BY id, created_at DESC
      )
      SELECT
      id,
        ${ioFields}
        source_trace_id,
        source_observation_id,
        status,
        created_at
        ${versionField ? ", latest_version" : ""}
      FROM latest_events
      WHERE deleted_at IS NULL
       OR deleted_at > ${version}
      ORDER BY id
      `,
    );

    const items = result.map((row) => this.convertRowToItem(row, includeIO));

    if (returnVersionTimestamp) {
      const versionTimestamp =
        result.length > 0 && result[0].latest_version
          ? result[0].latest_version
          : version;
      return { items, versionTimestamp } as any;
    }

    return items as any;
  }

  /**
   * Retrieves a list of dataset versions (distinct createdAt timestamps) for a given dataset.
   * Returns timestamps in descending order (newest first).
   */
  public static async listVersions(props: {
    projectId: string;
    datasetId: string;
  }): Promise<Date[]> {
    const result = await prisma.$queryRaw<{ created_at: Date }[]>`
      SELECT DISTINCT created_at
      FROM dataset_item_events
      WHERE project_id = ${props.projectId}
        AND dataset_id = ${props.datasetId}
      ORDER BY created_at DESC
    `;

    return result.map((row) => row.created_at);
  }

  /**
   * Retrieves the complete state of dataset items at a given version timestamp.
   * For each unique item ID, returns the latest event where:
   * - createdAt <= version
   * - deletedAt IS NULL OR deletedAt > version
   */
  public static async getItemsByVersion<
    IncludeIO extends boolean = true,
    ReturnVersion extends boolean = false,
  >(props: {
    projectId: string;
    datasetId: string;
    version: Date;
    includeIO?: IncludeIO;
    returnVersionTimestamp?: ReturnVersion;
  }): Promise<
    ReturnVersion extends true
      ? {
          items: Array<IncludeIO extends true ? ItemWithIO : ItemBase>;
          versionTimestamp: Date;
        }
      : Array<IncludeIO extends true ? ItemWithIO : ItemBase>
  > {
    const options = { ...this.DEFAULT_OPTIONS, ...props };

    return this.getItems({
      ...props,
      includeIO: options.includeIO as IncludeIO,
      returnVersionTimestamp: options.returnVersionTimestamp as ReturnVersion,
    });
  }

  /**
   * Retrieves the complete state of dataset items at a given version timestamp.
   * For each unique item ID, returns the latest event where:
   * - createdAt <= version
   * - deletedAt IS NULL OR deletedAt > version
   */
  public static async getItemsByLatest<
    IncludeIO extends boolean = true,
  >(props: {
    projectId: string;
    datasetId: string;
    includeIO?: IncludeIO;
  }): Promise<{
    versionTimestamp: Date;
    items: Array<IncludeIO extends true ? ItemWithIO : ItemBase>;
  }> {
    const options = { ...this.DEFAULT_OPTIONS, ...props };

    return this.getItems({
      ...props,
      version: new Date(),
      includeIO: options.includeIO as IncludeIO,
      returnVersionTimestamp: true,
    });
  }
}
