import { ScoreRecordReadType } from "./definitions";
import type {
  ScoreDataTypeType,
  ScoreByDataType,
  ScoreSourceType,
} from "../../domain/scores";
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

export const convertClickhouseScoreToDomain = <
  ExcludeMetadata extends boolean = false,
  DataType extends ScoreDataTypeType = ScoreDataTypeType,
>(
  record: ScoreRecordReadType,
  includeMetadataPayload: boolean = true,
): ScoreByDataType<DataType> => {
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
    longStringValue: record.long_string_value ?? "",
    source: record.source as ScoreSourceType,
    comment: record.comment ?? null,
    authorUserId: record.author_user_id ?? null,
    configId: record.config_id ?? null,
    dataType: record.data_type as DataType,
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
    return {
      ...baseScore,
      dataType: "NUMERIC" as DataType,
      stringValue: null,
    } as ScoreByDataType<DataType>;
  }

  if (record.data_type === "CORRECTION") {
    return {
      ...baseScore,
      dataType: "CORRECTION" as DataType,
      stringValue: null,
    } as ScoreByDataType<DataType>;
  }

  return {
    ...baseScore,
    dataType: record.data_type as DataType,
    stringValue: record.string_value!,
  } as ScoreByDataType<DataType>;
};

export const convertScoreAggregation = <DataType extends ScoreDataTypeType>(
  row: ScoreAggregation,
) => {
  return {
    id: row.id,
    name: row.name,
    stringValue: row.string_value,
    value: Number(row.value),
    source: row.source as ScoreSourceType,
    dataType: row.data_type as DataType,
    comment: row.comment,
    timestamp: row.timestamp,
  };
};
