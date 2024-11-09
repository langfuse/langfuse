import { ObservationLevel, Trace } from "@prisma/client";
import { parseClickhouseUTCDateTimeFormat } from "./clickhouse";
import { TraceRecordReadType } from "./definitions";
import { TracesTableReturnType } from "./traces";
import Decimal from "decimal.js";
import { ScoreAggregate } from "../../features/scores";

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

export const convertToReturnType = (
  row: TracesTableReturnType,
): TracesAllReturnType => {
  return {
    id: row.id,
    name: row.name ?? null,
    timestamp: new Date(row.timestamp),
    tags: row.tags,
    bookmarked: row.bookmarked,
    release: row.release ?? null,
    version: row.version ?? null,
    projectId: row.project_id,
    userId: row.user_id ?? null,
    sessionId: row.session_id ?? null,
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

export const convertMetricsReturnType = (
  row: TracesTableReturnType & { scores: ScoreAggregate },
): TracesMetricsReturnType => {
  return {
    id: row.id,
    promptTokens: BigInt(row.usage_details?.input ?? 0),
    completionTokens: BigInt(row.usage_details?.output ?? 0),
    totalTokens: BigInt(row.usage_details?.total ?? 0),
    latency: row.latency_milliseconds
      ? Number(row.latency_milliseconds) / 1000
      : null,
    level: row.level,
    observationCount: BigInt(row.observation_count ?? 0),
    calculatedTotalCost: row.cost_details?.total
      ? new Decimal(row.cost_details.total)
      : null,
    calculatedInputCost: row.cost_details?.input
      ? new Decimal(row.cost_details.input)
      : null,
    calculatedOutputCost: row.cost_details?.output
      ? new Decimal(row.cost_details.output)
      : null,
    scores: row.scores,
  };
};
