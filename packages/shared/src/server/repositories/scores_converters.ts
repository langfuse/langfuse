import { ScoreSource, ScoreDataType } from "@prisma/client";
import { ScoreRecordReadType } from "./definitions";

export type ScoreAggregation = {
  id: string;
  name: string;
  string_value: string | null;
  value: string;
  source: string;
  data_type: string;
  comment: string | null;
};

export const convertToScore = (row: ScoreRecordReadType) => {
  return {
    id: row.id,
    timestamp: new Date(row.timestamp),
    projectId: row.project_id,
    traceId: row.trace_id,
    observationId: row.observation_id ?? null,
    name: row.name,
    value: row.value ?? null,
    source: row.source as ScoreSource,
    comment: row.comment ?? null,
    authorUserId: row.author_user_id ?? null,
    configId: row.config_id ?? null,
    dataType: row.data_type as ScoreDataType,
    stringValue: row.string_value ?? null,
    queueId: row.queue_id ?? null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
};

export const convertScoreAggregation = (row: ScoreAggregation) => {
  return {
    id: row.id,
    name: row.name,
    stringValue: row.string_value,
    value: Number(row.value),
    source: row.source as ScoreSource,
    dataType: row.data_type as ScoreDataType,
    comment: row.comment,
  };
};
