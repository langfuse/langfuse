import { ObservationLevel, Trace } from "@prisma/client";
import { parseClickhouseUTCDateTimeFormat } from "./clickhouse";
import { TraceRecordReadType } from "./definitions";
import { TracesTableReturnType } from "./traces";
import Decimal from "decimal.js";
import { ScoreAggregate } from "../../features/scores";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";

export const convertTraceDomainToClickhouse = (
  trace: Trace,
): TraceRecordReadType => {
  return {
    id: trace.id,
    timestamp: convertDateToClickhouseDateTime(trace.timestamp),
    name: trace.name,
    user_id: trace.userId,
    metadata: trace.metadata as Record<string, string>,
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

export type TracesAllReturnType = {
  id: string;
  timestamp: Date;
  name: string | null;
  projectId: string;
  userId: string | null;
  release: string | null;
  version: string | null;
  public: boolean;
  bookmarked: boolean;
  sessionId: string | null;
  tags: string[];
};

export const convertToDomain = (row: TracesTableReturnType) => {
  return {
    id: row.id,
    projectId: row.project_id,
    timestamp: parseClickhouseUTCDateTimeFormat(row.timestamp),
    tags: row.tags,
    bookmarked: row.bookmarked,
    name: row.name ?? null,
    release: row.release ?? null,
    version: row.version ?? null,
    userId: row.user_id ?? null,
    sessionId: row.session_id ?? null,
    latencyMilliseconds: Number(row.latency_milliseconds),
    usageDetails: row.usage_details,
    costDetails: row.cost_details,
    level: row.level,
    observationCount: Number(row.observation_count),
    scoresAvg: row.scores_avg,
    public: row.public,
  };
};

export type TracesMetricsReturnType = {
  id: string;
  promptTokens: bigint;
  completionTokens: bigint;
  totalTokens: bigint;
  latency: number | null;
  level: ObservationLevel;
  observationCount: bigint;
  calculatedTotalCost: Decimal | null;
  calculatedInputCost: Decimal | null;
  calculatedOutputCost: Decimal | null;
  scores: ScoreAggregate;
};
