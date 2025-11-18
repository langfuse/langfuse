import { prisma } from "../../../db";

export class DatasetService {
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
  }): Promise<
    Array<{
      id: string;
      input: any;
      expectedOutput: any;
      metadata: any;
      sourceTraceId: string | null;
      sourceObservationId: string | null;
      status: string;
      createdAt: Date | null;
    }>
  > {
    const result = await prisma.$queryRaw<
      Array<{
        id: string;
        input: any;
        expected_output: any;
        metadata: any;
        source_trace_id: string | null;
        source_observation_id: string | null;
        status: string;
        created_at: Date | null;
      }>
    >`
      WITH latest_events AS (
        SELECT DISTINCT ON (id)
          id,
          input,
          expected_output,
          metadata,
          source_trace_id,
          source_observation_id,
          status,
          created_at,
          deleted_at
        FROM dataset_item_events
        WHERE project_id = ${props.projectId}
          AND dataset_id = ${props.datasetId}
          AND created_at <= ${props.version}
        ORDER BY id, created_at DESC
      )
      SELECT
        id,
        input,
        expected_output,
        metadata,
        source_trace_id,
        source_observation_id,
        status,
        created_at
      FROM latest_events
      WHERE deleted_at IS NULL
         OR deleted_at > ${props.version}
      ORDER BY id
    `;

    return result.map((row) => ({
      id: row.id,
      input: row.input,
      expectedOutput: row.expected_output,
      metadata: row.metadata,
      sourceTraceId: row.source_trace_id,
      sourceObservationId: row.source_observation_id,
      status: row.status,
      createdAt: row.created_at,
    }));
  }
}
