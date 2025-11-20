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

type ItemBase = {
  id: string;
  sourceTraceId: string | null;
  sourceObservationId: string | null;
  status: string;
  createdAt: Date | null;
};

type ItemWithIO = ItemBase & {
  input: any;
  expectedOutput: any;
  metadata: any;
};

export class DatasetItemManager {
  private static DEFAULT_OPTIONS = {
    includeIO: true,
    returnVersionTimestamp: false,
  };

  private static convertRowToItem<IncludeIO extends boolean>(
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
          }
        : base
    ) as IncludeIO extends true ? ItemWithIO : ItemBase;
  }

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
   * Retrieves the complete state of dataset items at the latest version.
   * Returns both items and the actual latest version timestamp.
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

  public static async createItem(props: {
    projectId: string;
    datasetId: string;
    input?: string | null;
    expectedOutput?: string | null;
    metadata?: string | null;
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

  // TODO: maybe upsert instead
  public static async updateItem(props: {
    projectId: string;
    datasetId: string;
    datasetItemId: string;
    input?: string | null;
    expectedOutput?: string | null;
    metadata?: string | null;
    sourceTraceId?: string;
    sourceObservationId?: string;
    status?: DatasetStatus;
    normalizeOpts?: { sanitizeControlChars?: boolean };
    validateOpts: { normalizeUndefinedToNull?: boolean };
  }): Promise<{ success: true; updatedItem: DatasetItem } | PayloadError> {
    // 1. Get dataset
    const result = await this.getDatasets({
      projectId: props.projectId,
      datasetIds: [props.datasetId],
    });
    const dataset = result.shift()!;

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

    // 3. Update item
    const datasetItem = await prisma.datasetItem.update({
      where: {
        id_projectId: {
          id: props.datasetItemId,
          projectId: props.projectId,
        },
        datasetId: props.datasetId,
      },
      data: {
        ...itemPayload,
        sourceTraceId: props.sourceTraceId,
        sourceObservationId: props.sourceObservationId,
        status: props.status,
      },
    });

    return { success: true, updatedItem: datasetItem };
  }

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
}
