import {
  commandClickhouse,
  queryClickhouse,
  queryClickhouseStream,
} from "./clickhouse";
import { EventLogRecordReadType } from "./definitions";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";

export const getEventLogByProjectAndEntityId = async (
  projectId: string,
  entityType: string,
  entityId: string,
): Promise<EventLogRecordReadType[]> => {
  const query = `
    select *
    from event_log
    where project_id = {projectId: String}
    and entity_type = {entityType: String}
    and entity_id = {entityId: String}
  `;

  return queryClickhouse<EventLogRecordReadType>({
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

export const getEventLogByProjectId = (
  projectId: string,
): AsyncGenerator<EventLogRecordReadType> => {
  const query = `
    select *
    from event_log
    where project_id = {projectId: String}
  `;

  return queryClickhouseStream<EventLogRecordReadType>({
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

export const getEventLogByProjectIdBeforeDate = (
  projectId: string,
  beforeDate: Date,
): AsyncGenerator<EventLogRecordReadType> => {
  const query = `
        select *
        from event_log
        where project_id = {projectId: String}
        and created_at <= {beforeDate: DateTime64(3)}
    `;

  return queryClickhouseStream<EventLogRecordReadType>({
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

export const getEventLogByProjectIdAndEntityIds = (
  projectId: string,
  entityType: "observation" | "trace" | "score",
  entityIds: string[],
): AsyncGenerator<EventLogRecordReadType> => {
  const query = `
    select *
    from event_log
    where project_id = {projectId: String}
      and entity_type = {entityType: String}
      and entity_id in ({entityIds: Array(String)})
  `;

  return queryClickhouseStream<EventLogRecordReadType>({
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

export const getEventLogByProjectIdAndTraceIds = (
  projectId: string,
  traceIds: string[],
): AsyncGenerator<EventLogRecordReadType> => {
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
    from event_log el
    left semi join filtered_events fe
    on el.project_id = fe.project_id and el.entity_id = fe.entity_id and el.entity_type = fe.entity_type
    where el.project_id = {projectId: String}
  `;

  return queryClickhouseStream<EventLogRecordReadType>({
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

/**
 * Deletes event log records by projectId and the _eventLog_.id
 * @param projectId - Project ID
 * @param ids - ID record of the event log table to be deleted
 */
export const deleteEventLogByProjectIdAndIds = async (
  projectId: string,
  ids: string[],
): Promise<void> => {
  const query = `  
    delete from event_log
    where project_id = {projectId: String}
    and id in ({ids: Array(String)});
  `;

  await commandClickhouse({
    query,
    params: {
      projectId,
      ids,
    },
    clickhouseConfigs: {
      request_timeout: 300_000, // 5 minutes
    },
    tags: {
      feature: "eventLog",
      kind: "delete",
      projectId,
    },
  });
};

export const deleteEventLogByProjectId = async (
  projectId: string,
): Promise<void> => {
  const query = `
    DELETE FROM event_log
    WHERE project_id = {projectId: String};
  `;
  await commandClickhouse({
    query: query,
    params: {
      projectId,
    },
    clickhouseConfigs: {
      request_timeout: 120_000, // 2 minutes
    },
    tags: {
      feature: "eventLog",
      kind: "delete",
      projectId,
    },
  });
};

export const deleteEventLogByProjectIdBeforeDate = async (
  projectId: string,
  beforeDate: Date,
): Promise<void> => {
  const query = `
    DELETE FROM event_log
    WHERE project_id = {projectId: String}
    AND created_at <= {beforeDate: DateTime64(3)};
  `;
  await commandClickhouse({
    query: query,
    params: {
      projectId,
      beforeDate: convertDateToClickhouseDateTime(beforeDate),
    },
    clickhouseConfigs: {
      request_timeout: 120_000, // 2 minutes
    },
    tags: {
      feature: "eventLog",
      kind: "delete",
      projectId,
    },
  });
};
