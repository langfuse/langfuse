import { Prisma } from "@prisma/client";
import { parseClickhouseUTCDateTimeFormat } from "./clickhouse";
import { TraceRecordReadType } from "./definitions";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import { parseJsonPrioritised } from "../../utils/json";
import { Trace } from "./types";

export const convertTraceDomainToClickhouse = (
  trace: Trace,
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
): Trace => {
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
    input: (record.input
      ? parseJsonPrioritised(record.input)
      : null) as Prisma.JsonValue | null,
    output: (record.output
      ? parseJsonPrioritised(record.output)
      : null) as Prisma.JsonValue | null,
    metadata:
      record.metadata &&
      Object.fromEntries(
        Object.entries(record.metadata ?? {}).map(([key, val]) => [
          key,
          val && parseJsonPrioritised(val),
        ]),
      ),
    createdAt: parseClickhouseUTCDateTimeFormat(record.created_at),
    updatedAt: parseClickhouseUTCDateTimeFormat(record.updated_at),
    externalId: null,
  };
};
