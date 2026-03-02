/**
 * Logic mirrors repositories/blobStorageLog.ts (ClickHouse); syntax adapted for OceanBase.
 * - FINAL → ROW_NUMBER() OVER (PARTITION BY id, project_id ORDER BY event_ts DESC) WHERE rn = 1
 * - queryClickhouse/queryClickhouseStream/commandClickhouse → adapter.queryWithOptions/queryStreamWithOptions/commandWithOptions
 * - Named params {x: String} → positional ?
 */
import { DatabaseAdapterFactory } from "../database";
import { BlobStorageFileRefRecordReadType } from "../repositories/definitions";
import { convertDateToDateTime } from "../database";

export const getBlobStorageByProjectAndEntityId = async (
  projectId: string,
  entityType: string,
  entityId: string,
): Promise<BlobStorageFileRefRecordReadType[]> => {
  const adapter = DatabaseAdapterFactory.getInstance();
  const query = `
    SELECT *
    FROM (
      SELECT *,
        ROW_NUMBER() OVER (PARTITION BY id, project_id ORDER BY event_ts DESC) as rn
      FROM blob_storage_file_log
    ) ranked
    WHERE rn = 1
    AND project_id = ?
    AND entity_type = ?
    AND entity_id = ?
  `;

  return adapter.queryWithOptions<BlobStorageFileRefRecordReadType>({
    query,
    params: [projectId, entityType, entityId],
    tags: {
      feature: "eventLog",
      kind: "byID",
      projectId,
    },
  });
};

export const getBlobStorageByProjectId = (
  projectId: string,
): AsyncGenerator<BlobStorageFileRefRecordReadType> => {
  const adapter = DatabaseAdapterFactory.getInstance();
  const query = `
    SELECT *
    FROM (
      SELECT *,
        ROW_NUMBER() OVER (PARTITION BY id, project_id ORDER BY event_ts DESC) as rn
      FROM blob_storage_file_log
    ) ranked
    WHERE rn = 1
    AND project_id = ?
  `;

  return adapter.queryStreamWithOptions<BlobStorageFileRefRecordReadType>({
    query,
    params: [projectId],
    tags: {
      feature: "eventLog",
      kind: "list",
      projectId,
    },
  });
};

export const getBlobStorageByProjectIdBeforeDate = (
  projectId: string,
  beforeDate: Date,
): AsyncGenerator<BlobStorageFileRefRecordReadType> => {
  const adapter = DatabaseAdapterFactory.getInstance();
  const query = `
    SELECT *
    FROM (
      SELECT *,
        ROW_NUMBER() OVER (PARTITION BY id, project_id ORDER BY event_ts DESC) as rn
      FROM blob_storage_file_log
    ) ranked
    WHERE rn = 1
    AND project_id = ?
    AND created_at <= ?
  `;

  return adapter.queryStreamWithOptions<BlobStorageFileRefRecordReadType>({
    query,
    params: [projectId, convertDateToDateTime(beforeDate)],
    tags: {
      feature: "eventLog",
      kind: "list",
      projectId,
    },
  });
};

export const getBlobStorageByProjectIdAndEntityIds = (
  projectId: string,
  entityType: "observation" | "trace" | "score",
  entityIds: string[],
): AsyncGenerator<BlobStorageFileRefRecordReadType> => {
  const adapter = DatabaseAdapterFactory.getInstance();
  const placeholders = entityIds.map(() => "?").join(", ");
  const query = `
    SELECT *
    FROM (
      SELECT *,
        ROW_NUMBER() OVER (PARTITION BY id, project_id ORDER BY event_ts DESC) as rn
      FROM blob_storage_file_log
    ) ranked
    WHERE rn = 1
    AND project_id = ?
    AND entity_type = ?
    AND entity_id IN (${placeholders})
  `;

  return adapter.queryStreamWithOptions<BlobStorageFileRefRecordReadType>({
    query,
    params: [projectId, entityType, ...entityIds],
    tags: {
      feature: "eventLog",
      kind: "list",
      projectId,
    },
  });
};

export const getBlobStorageByProjectIdAndTraceIds = (
  projectId: string,
  traceIds: string[],
): AsyncGenerator<BlobStorageFileRefRecordReadType> => {
  const adapter = DatabaseAdapterFactory.getInstance();
  const tracePlaceholders = traceIds.map(() => "?").join(", ");
  const query = `
    WITH filtered_traces AS (
      SELECT DISTINCT
        id as entity_id,
        project_id as project_id,
        'trace' as entity_type
      FROM (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY id, project_id ORDER BY event_ts DESC) as rn
        FROM traces
      ) ranked
      WHERE rn = 1
      AND project_id = ?
      AND id IN (${tracePlaceholders})
    ), filtered_observations AS (
      SELECT DISTINCT
        id as entity_id,
        project_id as project_id,
        'observation' as entity_type
      FROM (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY id, project_id ORDER BY event_ts DESC) as rn
        FROM observations
      ) ranked
      WHERE rn = 1
      AND project_id = ?
      AND trace_id IN (${tracePlaceholders})
    ), filtered_scores AS (
      SELECT DISTINCT
        id as entity_id,
        project_id as project_id,
        'score' as entity_type
      FROM (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY id, project_id ORDER BY event_ts DESC) as rn
        FROM scores
      ) ranked
      WHERE rn = 1
      AND project_id = ?
      AND trace_id IN (${tracePlaceholders})
    ), filtered_events AS (
      SELECT *
      FROM filtered_traces
      UNION ALL
      SELECT *
      FROM filtered_observations
      UNION ALL
      SELECT *
      FROM filtered_scores
    )

    -- Convert LEFT SEMI JOIN to IN subquery (MySQL/OceanBase doesn't support SEMI JOIN)
    SELECT el.*
    FROM (
      SELECT *,
        ROW_NUMBER() OVER (PARTITION BY id, project_id ORDER BY event_ts DESC) as rn
      FROM blob_storage_file_log
    ) el
    WHERE el.rn = 1
    AND el.project_id = ?
    AND (el.project_id, el.entity_id, el.entity_type) IN (
      SELECT project_id, entity_id, entity_type
      FROM filtered_events
    )
  `;

  return adapter.queryStreamWithOptions<BlobStorageFileRefRecordReadType>({
    query,
    params: [
      projectId, // filtered_traces WHERE
      ...traceIds, // filtered_traces IN
      projectId, // filtered_observations WHERE
      ...traceIds, // filtered_observations IN
      projectId, // filtered_scores WHERE
      ...traceIds, // filtered_scores IN
      projectId, // main WHERE
    ],
    tags: {
      feature: "eventLog",
      kind: "list",
      projectId,
    },
  });
};

// this function is only used for the background migration from event_log to blob_storage_file_log
export const insertIntoS3RefsTableFromEventLog = async (
  limit: number,
  offset: number,
) => {
  const adapter = DatabaseAdapterFactory.getInstance();
  const query = `
    INSERT INTO blob_storage_file_log
    SELECT
      id,
      project_id,
      entity_type,
      entity_id,
      event_id,
      bucket_name,
      bucket_path,
      created_at,
      updated_at,
      created_at AS event_ts,
      0 AS is_deleted
    FROM event_log
    ORDER BY project_id DESC, entity_type DESC, entity_id DESC, bucket_path DESC
    LIMIT ?
    OFFSET ?
  `;

  await adapter.commandWithOptions({
    query,
    params: [limit, offset],
    tags: {
      feature: "backgroundMigration",
      kind: "list",
    },
  });
};

export const getLastEventLogPrimaryKey = async () => {
  const adapter = DatabaseAdapterFactory.getInstance();
  const query = `
    SELECT project_id, entity_type, entity_id, bucket_path
    FROM event_log
    ORDER BY project_id ASC, entity_type ASC, entity_id ASC, bucket_path ASC
    LIMIT 1
  `;
  const result = await adapter.queryWithOptions<{
    project_id: string;
    entity_type: string;
    entity_id: string;
    bucket_path: string;
  }>({ query });
  return result.shift();
};

export const findS3RefsByPrimaryKey = async (primaryKey: {
  project_id: string;
  entity_type: string;
  entity_id: string;
  bucket_path: string;
}) => {
  const adapter = DatabaseAdapterFactory.getInstance();
  const query = `
    SELECT *
    FROM (
      SELECT *,
        ROW_NUMBER() OVER (PARTITION BY id, project_id ORDER BY event_ts DESC) as rn
      FROM blob_storage_file_log
    ) ranked
    WHERE rn = 1
    AND project_id = ?
    AND entity_type = ?
    AND entity_id = ?
    AND bucket_path = ?
  `;
  return adapter.queryWithOptions<BlobStorageFileRefRecordReadType>({
    query,
    params: [
      primaryKey.project_id,
      primaryKey.entity_type,
      primaryKey.entity_id,
      primaryKey.bucket_path,
    ],
  });
};
