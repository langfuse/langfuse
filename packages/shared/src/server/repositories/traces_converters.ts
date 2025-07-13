import {
  clickhouseCompliantRandomCharacters,
  parseClickhouseUTCDateTimeFormat,
} from "./clickhouse";
import { TraceRecordReadType } from "./definitions";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import { parseJsonPrioritised } from "../../utils/json";
import { TraceDomain } from "../../domain";
import { parseMetadataCHRecordToDomain } from "../utils/metadata_conversion";

export type TraceDomainWithoutIO = Omit<TraceDomain, "input" | "output">;

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

export function convertClickhouseToDomain<
  ConvertToAsString extends boolean = false,
>({
  record,
  convertToString = false as ConvertToAsString,
}: {
  record: TraceRecordReadType;
  convertToString?: ConvertToAsString;
}): ConvertToAsString extends true
  ? { stringified: string; domain: TraceDomainWithoutIO }
  : TraceDomain {
  const inputIdentifier = clickhouseCompliantRandomCharacters();
  const outputIdentifier = clickhouseCompliantRandomCharacters();
  if (convertToString) {
    const stringified = {
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
      input: inputIdentifier,
      output: outputIdentifier,
      metadata: parseMetadataCHRecordToDomain(record.metadata),
      createdAt: parseClickhouseUTCDateTimeFormat(record.created_at),
      updatedAt: parseClickhouseUTCDateTimeFormat(record.updated_at),
    };
    let baseObject = JSON.stringify(stringified);

    // replace input and output with the identifiers
    if (record.input) {
      baseObject = baseObject.replace(inputIdentifier, record.input);
    }
    if (record.output) {
      baseObject = baseObject.replace(outputIdentifier, record.output);
    }

    // Create domain object without expensive input/output parsing
    const domain: TraceDomainWithoutIO = {
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
      metadata: parseMetadataCHRecordToDomain(record.metadata),
      createdAt: parseClickhouseUTCDateTimeFormat(record.created_at),
      updatedAt: parseClickhouseUTCDateTimeFormat(record.updated_at),
    };

    return { stringified: baseObject, domain } as ConvertToAsString extends true
      ? { stringified: string; domain: TraceDomainWithoutIO }
      : TraceDomain;
  }

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
    input: record.input ? (parseJsonPrioritised(record.input) ?? null) : null,
    output: record.output
      ? (parseJsonPrioritised(record.output) ?? null)
      : null,
    metadata: parseMetadataCHRecordToDomain(record.metadata),
    createdAt: parseClickhouseUTCDateTimeFormat(record.created_at),
    updatedAt: parseClickhouseUTCDateTimeFormat(record.updated_at),
  } as ConvertToAsString extends true
    ? { stringified: string; domain: TraceDomainWithoutIO }
    : TraceDomain;
}
