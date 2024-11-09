import { Trace } from "@prisma/client";
import { parseClickhouseUTCDateTimeFormat } from "./clickhouse";
import { TraceRecordReadType } from "./definitions";

export const convertClickhouseToDomain = (
  record: TraceRecordReadType,
): Trace => {
  return {
    id: record.id,
    projectId: record.project_id,
    name: record.name ?? null,
    timestamp: parseClickhouseUTCDateTimeFormat(record.timestamp),
    tags: record.tags,
    bookmarked: record.bookmarked,
    release: record.release ?? null,
    version: record.version ?? null,
    userId: record.user_id ?? null,
    sessionId: record.session_id ?? null,
    public: record.public,
    input: record.input ?? null,
    output: record.output ?? null,
    metadata: record.metadata,
    createdAt: parseClickhouseUTCDateTimeFormat(record.created_at),
    updatedAt: parseClickhouseUTCDateTimeFormat(record.updated_at),
    externalId: null,
  };
};
