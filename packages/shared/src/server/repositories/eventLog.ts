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
    tags: ["feature:eventLog", "kind:byId", `projectId:${projectId}`],
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
    tags: ["feature:eventLog", "kind:list", `projectId:${projectId}`],
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
    tags: ["feature:eventLog", "kind:list", `projectId:${projectId}`],
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
    tags: ["feature:eventLog", "kind:delete", `projectId:${projectId}`],
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
    tags: ["feature:eventLog", "kind:delete", `projectId:${projectId}`],
  });
};
