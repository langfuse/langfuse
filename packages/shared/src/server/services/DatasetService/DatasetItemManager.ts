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

type IdOrName = { datasetId: string } | { datasetName: string };

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

  public static async upsertItem(
    props: {
      projectId: string;
      datasetItemId?: string;
      input?: string | null;
      expectedOutput?: string | null;
      metadata?: string | null;
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
        ...itemPayload,
        datasetId: dataset.id,
        sourceTraceId: props.sourceTraceId ?? undefined,
        sourceObservationId: props.sourceObservationId ?? undefined,
        status: props.status ?? undefined,
        projectId: props.projectId,
      },
      update: {
        ...itemPayload,
        sourceTraceId: props.sourceTraceId ?? undefined,
        sourceObservationId: props.sourceObservationId ?? undefined,
        status: props.status ?? undefined,
      },
    });

    return { success: true, datasetItem: datasetItem };
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
