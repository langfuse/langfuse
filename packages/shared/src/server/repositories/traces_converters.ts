import { parseClickhouseUTCDateTimeFormat } from "./clickhouse";
import { TraceRecordReadType } from "./definitions";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import { parseJsonPrioritised } from "../../utils/json";
import { TraceDomain } from "../../domain";
import { parseMetadataCHRecordToDomain } from "../utils/metadata_conversion";
import { isDorisBackend } from "./analytics";


// Helper function to parse timestamps from different backends
const parseTimestamp = (timestamp: string | Date): Date => {
  // Only apply special handling for Doris backend
  if (isDorisBackend() && timestamp instanceof Date) {
    return timestamp;
  }
  
  // Default ClickHouse behavior - always expect string
  if (typeof timestamp === 'string') {
    return parseClickhouseUTCDateTimeFormat(timestamp);
  }
  
  throw new Error(`Invalid timestamp format: ${typeof timestamp}`);
};



export const convertTraceDomainToClickhouse = (
  trace: TraceDomain,
): TraceRecordReadType => {
  return {
    id: trace.id,
    timestamp: convertDateToClickhouseDateTime(trace.timestamp),
    name: trace.name,
    user_id: trace.userId,
    metadata: trace.metadata as Record<string, string>,
    environment: trace.environment,
    release: trace.release,
    version: trace.version,
    project_id: trace.projectId,
    public: trace.public,
    bookmarked: trace.bookmarked,
    tags: trace.tags,
    input: trace.input as string,
    output: trace.output as string,
    session_id: trace.sessionId,
    created_at: convertDateToClickhouseDateTime(trace.createdAt),
    updated_at: convertDateToClickhouseDateTime(trace.updatedAt),
    event_ts: convertDateToClickhouseDateTime(new Date()),
    is_deleted: 0,
  };
};

export const convertClickhouseToDomain = (
  record: TraceRecordReadType,
): TraceDomain => {
  return {
    id: record.id,
    projectId: record.project_id,
    name: record.name ?? null,
    timestamp: parseTimestamp(record.timestamp),
    environment: record.environment,
    tags: record.tags,
    bookmarked: record.bookmarked,
    release: record.release ?? null,
    version: record.version ?? null,
    userId: record.user_id ?? null,
    sessionId: record.session_id ?? null,
    public: record.public,
    input: record.input ? (parseJsonPrioritised(record.input) ?? null) : null,
    output: record.output
      ? (parseJsonPrioritised(record.output) ?? null)
      : null,
    metadata: parseMetadataCHRecordToDomain(record.metadata),
    createdAt: parseTimestamp(record.created_at),
    updatedAt: parseTimestamp(record.updated_at),
  };
};
