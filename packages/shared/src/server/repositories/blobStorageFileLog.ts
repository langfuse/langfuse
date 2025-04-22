import {
  commandClickhouse,
  parseClickhouseUTCDateTimeFormat,
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
  const query = `
    with filtered_traces as (
      select distinct
        id as entity_id,
        project_id as project_id,
        'trace' as entity_type
      from traces
      where project_id = {projectId: String}
        and id in ({traceIds: Array(String)})
    ), filtered_observations as (
      select distinct
        id as entity_id,
        project_id as project_id,
        'observation' as entity_type
      from observations
      where project_id = {projectId: String}
        and trace_id in ({traceIds: Array(String)})
    ), filtered_scores as (
      select distinct
        id as entity_id,
        project_id as project_id,
        'score' as entity_type
      from scores
      where project_id = {projectId: String}
        and trace_id in ({traceIds: Array(String)})
    ), filtered_events as (
      select *
      from filtered_traces
      union all
      select *
      from filtered_observations
      union all
      select *
      from filtered_scores
    )

    -- We use a semi join because we only use the 'filtered_events' as a filter.
    -- There is no need to build the cartesian product (i.e. the combination) between the event log and the events.
    select el.*
    from blob_storage_file_log el FINAL
    left semi join filtered_events fe
    on el.project_id = fe.project_id and el.entity_id = fe.entity_id and el.entity_type = fe.entity_type
    where el.project_id = {projectId: String}
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
    tags: {
      feature: "eventLog",
      kind: "list",
      projectId,
    },
  });
};

export const getEventLogOrderedByTime = async (
  largerThanEqual: Date,
  limit: number,
) => {
  console.log(`execute query with ${largerThanEqual} and ${limit}`);
  const query = `
    SELECT *
    FROM event_log
    WHERE created_at >= {largerThanEqual: DateTime64(3)}
    ORDER BY created_at ASC
    LIMIT {limit: Int32}
  `;

  const rows = await queryClickhouse<BlobStorageFileRefRecordReadType>({
    query,
    params: {
      largerThanEqual: convertDateToClickhouseDateTime(largerThanEqual),
      limit,
    },
    tags: {
      feature: "backgroundMigration",
      kind: "list",
    },
  });

  return rows.map((r) => ({
    ...r,
    created_at: parseClickhouseUTCDateTimeFormat(r.created_at),
    updated_at: parseClickhouseUTCDateTimeFormat(r.updated_at),
  }));
};
