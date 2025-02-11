import { queryClickhouse } from "./clickhouse";
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
