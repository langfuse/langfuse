import { ScoreSource, ScoreDataType } from "@prisma/client";
import { FetchScoresReturnType } from "./scores";

export const convertToScore = (row: FetchScoresReturnType) => {
  return {
    id: row.id,
    timestamp: new Date(row.timestamp),
    projectId: row.project_id,
    traceId: row.trace_id,
    observationId: row.observation_id,
    name: row.name,
    value: row.value,
    source: row.source as ScoreSource,
    comment: row.comment,
    authorUserId: row.author_user_id,
    configId: row.config_id,
    dataType: row.data_type as ScoreDataType,
    stringValue: row.string_value,
    queueId: row.queue_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
};
