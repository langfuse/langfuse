import { ScoreDataType } from "@prisma/client";
import { ScoreRecordReadType } from "./definitions";
import { ScoreDomain, ScoreSourceType } from "../../domain/scores";
import { parseMetadataCHRecordToDomain } from "../utils/metadata_conversion";
import { parseClickhouseUTCDateTimeFormat } from "./clickhouse";

export type ScoreAggregation = {
  id: string;
  name: string;
  string_value: string | null;
  value: string;
  source: string;
  data_type: string;
  comment: string | null;
  timestamp: Date;
};

export const convertClickhouseScoreToDomain = <ExcludeMetadata extends boolean>(
  record: ScoreRecordReadType,
  includeMetadataPayload: boolean = true,
): ScoreDomain => {
  const baseScore = {
    id: record.id,
    timestamp: parseClickhouseUTCDateTimeFormat(record.timestamp),
    projectId: record.project_id,
    environment: record.environment,
    traceId: record.trace_id ?? null,
    sessionId: record.session_id ?? null,
    observationId: record.observation_id ?? null,
    datasetRunId: record.dataset_run_id ?? null,
    name: record.name,
    value: record.value,
    source: record.source as ScoreSourceType,
    comment: record.comment ?? null,
    authorUserId: record.author_user_id ?? null,
    configId: record.config_id ?? null,
    dataType: record.data_type as ScoreDataType,
    queueId: record.queue_id ?? null,
    executionTraceId: record.execution_trace_id ?? null,
    createdAt: record.created_at
      ? parseClickhouseUTCDateTimeFormat(record.created_at)
      : new Date(),
    updatedAt: record.updated_at
      ? parseClickhouseUTCDateTimeFormat(record.updated_at)
      : new Date(),
    metadata: (includeMetadataPayload
      ? (parseMetadataCHRecordToDomain(record.metadata ?? {}) ?? {})
      : {}) as ExcludeMetadata extends true
      ? never
      : NonNullable<ReturnType<typeof parseMetadataCHRecordToDomain>>,
  };

  if (record.data_type === "NUMERIC") {
    return { ...baseScore, dataType: "NUMERIC", stringValue: null };
  }

  return {
    ...baseScore,
    dataType: record.data_type as "CATEGORICAL" | "BOOLEAN",
    stringValue: record.string_value!,
  };
};

export const convertScoreAggregation = (row: ScoreAggregation) => {
  return {
    id: row.id,
    name: row.name,
    stringValue: row.string_value,
    value: Number(row.value),
    source: row.source as ScoreSourceType,
    dataType: row.data_type as ScoreDataType,
    comment: row.comment,
    timestamp: row.timestamp,
  };
};
