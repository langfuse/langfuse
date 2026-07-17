import {
  commandClickhouse,
  queryClickhouse,
  queryClickhouseStream,
} from "./clickhouse";
import { BlobStorageFileRefRecordReadType } from "./definitions";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";

export const getBlobStorageByProjectAndEntityId = async (
  projectId: string,
  entityType: string,
  entityId: string,
): Promise<BlobStorageFileRefRecordReadType[]> => {
  const query = `
    select *
    from blob_storage_file_log FINAL
    where project_id = {projectId: String}
    and entity_type = {entityType: String}
    and entity_id = {entityId: String}
  `;

  return queryClickhouse<BlobStorageFileRefRecordReadType>({
    query,
    params: {
      projectId,
      entityType,
      entityId,
    },
    tags: { projectId },
  });
};

export const getBlobStorageByProjectId = (
  projectId: string,
): AsyncGenerator<BlobStorageFileRefRecordReadType> => {
  const query = `
    select *
    from blob_storage_file_log FINAL
    where project_id = {projectId: String}
  `;

  return queryClickhouseStream<BlobStorageFileRefRecordReadType>({
    query,
    params: {
      projectId,
    },
    tags: { projectId },
  });
};

export const getBlobStorageByProjectIdBeforeDate = (
  projectId: string,
  beforeDate: Date,
): AsyncGenerator<BlobStorageFileRefRecordReadType> => {
  const query = `
        select *
        from blob_storage_file_log FINAL
        where project_id = {projectId: String}
        and created_at <= {beforeDate: DateTime64(3)}
    `;

  return queryClickhouseStream<BlobStorageFileRefRecordReadType>({
    query,
    params: {
      projectId,
      beforeDate: convertDateToClickhouseDateTime(beforeDate),
    },
    tags: { projectId },
  });
};

export const getBlobStorageByProjectIdAndEntityIds = (
  projectId: string,
  entityType: "observation" | "trace" | "score",
  entityIds: string[],
): AsyncGenerator<BlobStorageFileRefRecordReadType> => {
  const query = `
    select *
    from blob_storage_file_log FINAL
    where project_id = {projectId: String}
      and entity_type = {entityType: String}
      and entity_id in ({entityIds: Array(String)})
  `;

  return queryClickhouseStream<BlobStorageFileRefRecordReadType>({
    query,
    params: {
      projectId,
      entityType,
      entityIds,
    },
    clickhouseConfigs: {
      request_timeout: 120_000, // 2 minutes
    },
    tags: { projectId },
  });
};

export const getBlobStorageByProjectIdAndTraceIds = (
  projectId: string,
  traceIds: string[],
  opts?: { includeEventsTable?: boolean },
): AsyncGenerator<BlobStorageFileRefRecordReadType> => {
  const includeEventsTable = opts?.includeEventsTable ?? false;

  // In v4 events_only write mode spans live only in events_core, not in the
  // observations table. Include an events_core branch so their blob refs are
  // cleaned up too. Gated behind a flag because events_core is a dev/v4-only
  // table (created by clickhouse/scripts/dev-tables.sh, not by migrations) and
  // self-hosters on legacy write mode may not have it. When disabled the query
  // must not reference events_core at all.
  const filteredEventsCoreCte = includeEventsTable
    ? `, filtered_events_core as (
      select
        span_id as entity_id,
        'observation' as entity_type
      from events_core
      where project_id = {projectId: String}
        and trace_id in ({traceIds: Array(String)})
    )`
    : "";
  const filteredEventsCoreUnion = includeEventsTable
    ? `
      union all
      select * from filtered_events_core`
    : "";

  // We filter the blob log with a tuple `(entity_type, entity_id) IN (subquery)`
  // predicate rather than a JOIN. A prepared-set IN predicate on the leading
  // primary-key columns participates in primary-index analysis, so ClickHouse
  // can prune granules down to the target entities. A JOIN key does not, which
  // forced a FINAL scan of the whole project's blob log. The trace entity ids
  // are exactly the input traceIds, so we build them with arrayJoin instead of
  // reading the traces table (which is both wasted work and, in events_only
  // mode where the trace has no traces row, a coverage bug that leaked files).
  const query = `
    with filtered_traces as (
      select
        arrayJoin({traceIds: Array(String)}) as entity_id,
        'trace' as entity_type
    ), filtered_observations as (
      select
        id as entity_id,
        'observation' as entity_type
      from observations
      where project_id = {projectId: String}
        and trace_id in ({traceIds: Array(String)})
    ), filtered_scores as (
      select
        id as entity_id,
        'score' as entity_type
      from scores
      where project_id = {projectId: String}
        and trace_id in ({traceIds: Array(String)})
    )${filteredEventsCoreCte}, filtered_entities as (
      select * from filtered_traces
      union all
      select * from filtered_observations
      union all
      select * from filtered_scores${filteredEventsCoreUnion}
    )

    select el.*
    from blob_storage_file_log el FINAL
    where el.project_id = {projectId: String}
      and (el.entity_type, el.entity_id) in (
        select entity_type, entity_id from filtered_entities
      )
  `;

  return queryClickhouseStream<BlobStorageFileRefRecordReadType>({
    query,
    params: {
      projectId,
      traceIds,
    },
    clickhouseConfigs: {
      request_timeout: 120_000, // 2 minutes
    },
    tags: { projectId },
  });
};

// this function is only used for the background migration from event_log to blob_storage_file_log
export const insertIntoS3RefsTableFromEventLog = async (
  limit: number,
  offset: number,
) => {
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
    ORDER BY (project_id, entity_type, entity_id, bucket_path) DESC
    LIMIT {limit: Int32}
    OFFSET {offset: Int32}
  `;

  await commandClickhouse({
    query,
    params: {
      limit,
      offset,
    },
  });
};

export const getLastEventLogPrimaryKey = async () => {
  const query = `
    SELECT project_id, entity_type, entity_id, bucket_path
    FROM event_log
    ORDER BY (project_id, entity_type, entity_id, bucket_path) ASC
    LIMIT 1
  `;
  const result = await queryClickhouse<{
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
  const query = `
    SELECT *
    FROM blob_storage_file_log
    WHERE project_id = {project_id: String}
      AND entity_type = {entity_type: String}
      AND entity_id = {entity_id: String}
      AND bucket_path = {bucket_path: String}
  `;
  return queryClickhouse<BlobStorageFileRefRecordReadType>({
    query,
    params: primaryKey,
  });
};
