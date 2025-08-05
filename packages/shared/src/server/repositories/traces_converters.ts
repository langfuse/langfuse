import { parseClickhouseUTCDateTimeFormat } from "./clickhouse";
import { TraceRecordReadType } from "./definitions";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import { parseJsonPrioritised } from "../../utils/json";
import { TraceDomain } from "../../domain";
import { parseMetadataCHRecordToDomain } from "../utils/metadata_conversion";
import { env } from "../../env";

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
  truncated = false,
): TraceDomain => {
  return {
    id: record.id,
    projectId: record.project_id,
    name: record.name ?? null,
    timestamp: parseClickhouseUTCDateTimeFormat(record.timestamp),
    environment: record.environment,
    tags: record.tags,
    bookmarked: record.bookmarked,
    release: record.release ?? null,
    version: record.version ?? null,
    userId: record.user_id ?? null,
    sessionId: record.session_id ?? null,
    public: record.public,
    input: record.input
      ? truncated &&
        record.input.length === env.LANGFUSE_SERVER_SIDE_IO_CHAR_LIMIT
        ? (parseJsonPrioritised(record.input + "\n...[truncated]") ?? null)
        : (parseJsonPrioritised(record.input ?? null) ?? null)
      : null,
    output: record.output
      ? truncated &&
        record.output.length === env.LANGFUSE_SERVER_SIDE_IO_CHAR_LIMIT
        ? (parseJsonPrioritised(record.output + "\n...[truncated]") ?? null)
        : (parseJsonPrioritised(record.output ?? null) ?? null)
      : null,
    metadata: parseMetadataCHRecordToDomain(record.metadata),
    createdAt: parseClickhouseUTCDateTimeFormat(record.created_at),
    updatedAt: parseClickhouseUTCDateTimeFormat(record.updated_at),
  };
};
