import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import {
  INTERNAL_EVAL_ENVIRONMENT_PREFIX,
  PUBLIC_LLM_JUDGE_ENVIRONMENT,
} from "../llm/isInternalEvalEnvironment";
import { queryClickhouse } from "./clickhouse";

// Finished traces: nothing ingested within the project's idle wait (event_ts, as
// trace-batch uses). Grouped by trace_id, so traces without a root observation count.
const topicSetupTracesSql = (days: "1" | "7", sampled: boolean) => `
  SELECT trace_id, max(event_ts) AS last_ts
  FROM events_core
  WHERE project_id = {projectId: String}
    AND start_time >= {now: DateTime64(3)} - INTERVAL ${days} DAY
    AND trace_id != ''
    AND is_deleted = 0
    AND NOT startsWith(environment, {internalEnvironmentPrefix: String})
    AND environment != {publicLlmJudgeEnvironment: String}
    ${
      sampled
        ? // Mirrors worker deterministicSampling: sha256(domain + traceId), top 53 bits.
          "AND bitShiftRight(reinterpretAsUInt64(reverse(substring(SHA256(concat('langfuse:evaluation-sampling:v1', char(0), trace_id)), 1, 8))), 11) < {sampling: Float64} * 9007199254740992"
        : ""
    }
  GROUP BY trace_id
  HAVING last_ts < {now: DateTime64(3)} - toIntervalMillisecond({idleMs: UInt32})`;

const topicSetupParams = (projectId: string, idleMs: number, now: Date) => ({
  projectId,
  idleMs,
  now: convertDateToClickhouseDateTime(now),
  internalEnvironmentPrefix: INTERNAL_EVAL_ENVIRONMENT_PREFIX,
  publicLlmJudgeEnvironment: PUBLIC_LLM_JUDGE_ENVIRONMENT,
});

// Setup reads must never hang the wizard; a timeout surfaces as a recoverable error.
const TOPIC_SETUP_COUNT_TIMEOUT_SECONDS = 10;
const TOPIC_SETUP_SELECTION_TIMEOUT_SECONDS = 30;

/** Unsampled finished-trace counts over at most 7 days for the Topics setup estimate. */
export async function getTopicSetupTraceCounts(input: {
  projectId: string;
  idleMs: number;
  now: Date;
}) {
  const rows = await queryClickhouse<{
    finished1d: string;
    finished7d: string;
  }>({
    query: `
      SELECT
        countIf(last_ts >= {now: DateTime64(3)} - INTERVAL 1 DAY) AS finished1d,
        count() AS finished7d
      FROM (${topicSetupTracesSql("7", false)})`,
    params: topicSetupParams(input.projectId, input.idleMs, input.now),
    tags: { route: "topics-setup-counts", projectId: input.projectId },
    preferredClickhouseService: "EventsReadOnly",
    clickhouseSettings: {
      max_execution_time: TOPIC_SETUP_COUNT_TIMEOUT_SECONDS,
    },
  });
  return {
    finished1d: Number(rows[0]?.finished1d ?? 0),
    finished7d: Number(rows[0]?.finished7d ?? 0),
  };
}

/** The most recent finished, sampled traces in one window for the Topics setup backfill. */
export async function getTopicSetupTraceIds(input: {
  projectId: string;
  idleMs: number;
  now: Date;
  days: 1 | 7;
  sampling: number;
  limit: number;
}) {
  const rows = await queryClickhouse<{ trace_id: string }>({
    query: `${topicSetupTracesSql(input.days === 1 ? "1" : "7", input.sampling < 1)}
      ORDER BY last_ts DESC, trace_id
      LIMIT {limit: UInt32}`,
    params: {
      ...topicSetupParams(input.projectId, input.idleMs, input.now),
      sampling: input.sampling,
      limit: input.limit,
    },
    tags: { route: "topics-setup-traces", projectId: input.projectId },
    preferredClickhouseService: "EventsReadOnly",
    clickhouseSettings: {
      max_execution_time: TOPIC_SETUP_SELECTION_TIMEOUT_SECONDS,
    },
  });
  return rows.map((row) => row.trace_id);
}
