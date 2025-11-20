import { Dataset, DatasetItem, prisma } from "../../../db";
import { LangfuseNotFoundError } from "../../../errors/NotFoundError";
import { DatasetItemValidator } from "./DatasetItemValidator";
import type { PayloadError } from "./types";

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

  private static async getDataset(props: {
    projectId: string;
    datasetId: string;
  }): Promise<Pick<Dataset, "id" | "inputSchema" | "expectedOutputSchema">> {
    const dataset = await prisma.dataset.findUnique({
      where: {
        id_projectId: { id: props.datasetId, projectId: props.projectId },
      },
      select: {
        id: true,
        inputSchema: true,
        expectedOutputSchema: true,
      },
    });

    if (!dataset)
      throw new LangfuseNotFoundError(
        `Dataset with id ${props.datasetId} not found for project ${props.projectId}`,
      );

    return dataset;
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
    opts: {
      normalizeUndefinedToNull?: boolean;
    };
  }): Promise<{ success: true; datasetItem: DatasetItem } | PayloadError> {
    // 1. Get dataset
    const dataset = await this.getDataset(props);

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
      normalizeUndefinedToNull: props.opts.normalizeUndefinedToNull,
    });

    if (!itemPayload.success) {
      return itemPayload;
    }

    // 3. Create item
    const item = await prisma.datasetItem.create({
      data: {
        ...itemPayload,
        projectId: props.projectId,
        datasetId: props.datasetId,
        sourceTraceId: props.sourceTraceId,
        sourceObservationId: props.sourceObservationId,
      },
    });

    return { success: true, datasetItem: item };
  }
}
