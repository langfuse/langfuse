import { prisma } from "../../../db";

export class DatasetService {
  private static DEFAULT_OPTIONS = { includeIO: true };

  private static convertRowToItem<WithIO extends boolean = true>(
    row: any,
    includeIO: WithIO,
  ) {
    const base = {
      id: row.id,
      sourceTraceId: row.source_trace_id,
      sourceObservationId: row.source_observation_id,
      status: row.status,
      createdAt: row.created_at,
    };

    return includeIO
      ? {
          ...base,
          input: row.input,
          expectedOutput: row.expected_output,
          metadata: row.metadata,
          status: row.status,
          createdAt: row.created_at,
        }
      : base;
  }

  private static async getItems(props: {
    projectId: string;
    datasetId: string;
    version: Date;
    options: {
      includeIO: boolean;
    };
  }): Promise<Array<ReturnType<typeof this.convertRowToItem>>> {
    const select = `
      id,
      ${props.options.includeIO ? "input" : ""}
      ${props.options.includeIO ? "expected_output" : ""}
      ${props.options.includeIO ? "metadata" : ""}
      source_trace_id,
      source_observation_id,
      status,
      created_at
    `;

    const result = await prisma.$queryRaw<Array<any>>`
      WITH latest_events AS (
        SELECT DISTINCT ON (id)
          deleted_at,
          ${select}
        FROM dataset_item_events
        WHERE project_id = ${props.projectId}
          AND dataset_id = ${props.datasetId}
          AND created_at <= ${props.version}
        ORDER BY id, created_at DESC
      )
      SELECT
        ${select}
      FROM latest_events
      WHERE deleted_at IS NULL
         OR deleted_at > ${props.version}
      ORDER BY id
    `;

    return result.map((row) =>
      this.convertRowToItem(row, props.options.includeIO),
    );
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
  public static async getItemsByVersion(props: {
    projectId: string;
    datasetId: string;
    version: Date;
    options?: {
      includeIO?: boolean;
    };
  }) {
    const options = { ...this.DEFAULT_OPTIONS, ...props.options };

    return this.getItems({
      ...props,
      options,
    });
  }

  /**
   * Retrieves the complete state of dataset items at a given version timestamp.
   * For each unique item ID, returns the latest event where:
   * - createdAt <= version
   * - deletedAt IS NULL OR deletedAt > version
   */
  public static async getItemsByLatest(props: {
    projectId: string;
    datasetId: string;
    options?: {
      includeIO?: boolean;
    };
  }) {
    const options = { ...this.DEFAULT_OPTIONS, ...props.options };

    return this.getItems({
      ...props,
      version: new Date(),
      options,
    });
  }
}
