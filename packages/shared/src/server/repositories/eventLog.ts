import {
  commandClickhouse,
  queryClickhouse,
  queryClickhouseStream,
} from "./clickhouse";
import { EventLogRecordReadType } from "./definitions";

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
  });
};
