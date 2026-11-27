import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import {
  INTERNAL_EVAL_ENVIRONMENT_PREFIX,
  PUBLIC_INTERNAL_EVAL_ENVIRONMENTS,
} from "../llm/isInternalEvalEnvironment";
import type { TopicEmbeddingConfig, TopicFacetRef } from "../../topics";
import { queryClickhouse } from "./clickhouse";
import { OBSERVATIONS_TO_TRACE_INTERVAL } from "./constants";

/** Trace IDs a rule filter selects, as a subquery; absent for every trace. */
type TopicSetupMatching = { query: string; params: Record<string, unknown> };
/** Setup reads the last 7 days, widening to 14 and 30 while the backfill is not full. */
export const TOPIC_SETUP_WINDOW_DAYS = [7, 14, 30] as const;
type TopicSetupDays = (typeof TOPIC_SETUP_WINDOW_DAYS)[number];
/** Facet versions whose stored results make a trace already summarized. */
type TopicSetupSummarized = {
  facets: TopicFacetRef[];
  embeddingConfig: TopicEmbeddingConfig;
};

// A trace counts as summarized once every facet has a stored result; a complete
// result only with the current embedding, since others cannot be clustered.
const summarizedTraceIdsSql = (days: TopicSetupDays) => `
  SELECT trace_id
  FROM topic_facet_summaries
  WHERE project_id = {projectId: String}
    AND unit_start_time >= {now: DateTime64(3)} - INTERVAL ${days} DAY
    AND trace_id != ''
    AND (facet_id, facet_version) IN arrayZip({facetIds: Array(String)}, {facetVersions: Array(UInt32)})
    AND (processing_state != 'complete' OR (embedding_model = {embeddingModel: String} AND embedding.size0 = {embeddingDimensions: UInt32}))
  GROUP BY trace_id
  HAVING uniqExact(facet_id) = length({facetIds: Array(String)})`;

// Finished traces: nothing ingested within the project's idle wait (event_ts, as
// trace dispatch uses). Grouped by trace_id, so traces without a root observation count.
const topicSetupTracesSql = (
  days: TopicSetupDays,
  matching?: TopicSetupMatching,
  summarized?: TopicSetupSummarized,
) => `
  SELECT trace_id, max(event_ts) AS last_ts
  FROM events_core
  WHERE project_id = {projectId: String}
    AND start_time >= {now: DateTime64(3)} - INTERVAL ${days} DAY
    AND trace_id != ''
    AND is_deleted = 0
    AND NOT startsWith(environment, {internalEnvironmentPrefix: String})
    AND environment NOT IN {publicInternalEnvironments: Array(String)}
    ${matching ? `AND trace_id IN (${matching.query})` : ""}
    ${summarized ? `AND trace_id NOT IN (${summarizedTraceIdsSql(days)})` : ""}
  GROUP BY trace_id
  HAVING last_ts < {now: DateTime64(3)} - toIntervalMillisecond({idleMs: UInt32})`;

const topicSetupParams = (projectId: string, idleMs: number, now: Date) => ({
  projectId,
  idleMs,
  now: convertDateToClickhouseDateTime(now),
  internalEnvironmentPrefix: INTERNAL_EVAL_ENVIRONMENT_PREFIX,
  publicInternalEnvironments: [...PUBLIC_INTERNAL_EVAL_ENVIRONMENTS],
});

// Setup reads must never hang the wizard; a timeout surfaces as a recoverable error.
const TOPIC_SETUP_COUNT_TIMEOUT_SECONDS = 10;
const TOPIC_SETUP_SELECTION_TIMEOUT_SECONDS = 30;

const summarizedParams = (summarized?: TopicSetupSummarized) =>
  summarized && {
    facetIds: summarized.facets.map(({ facetId }) => facetId),
    facetVersions: summarized.facets.map(({ version }) => version),
    ...summarized.embeddingConfig,
  };

/** Unsampled finished-trace count over one setup window, for the Topics setup estimate. */
export async function getTopicSetupTraceCount(input: {
  projectId: string;
  idleMs: number;
  now: Date;
  days: TopicSetupDays;
  matching?: TopicSetupMatching;
  /** Counts only traces not yet summarized for every facet. */
  summarized?: TopicSetupSummarized;
}): Promise<number> {
  const rows = await queryClickhouse<{ count: string }>({
    query: `
      SELECT count() AS count
      FROM (${topicSetupTracesSql(input.days, input.matching, input.summarized)})`,
    params: {
      ...input.matching?.params,
      ...topicSetupParams(input.projectId, input.idleMs, input.now),
      ...summarizedParams(input.summarized),
    },
    tags: { route: "topics-setup-counts", projectId: input.projectId },
    preferredClickhouseService: "EventsReadOnly",
    clickhouseSettings: {
      max_execution_time: TOPIC_SETUP_COUNT_TIMEOUT_SECONDS,
    },
  });
  return Number(rows[0]?.count ?? 0);
}

/**
 * Finished traces in one window for the Topics setup backfill: every match up to
 * the limit, and a random sample of that size, seeded and repeatable, beyond it.
 * The rule's sampling rate does not apply, so a low rate still fills the first map.
 */
export async function getTopicSetupTraceIds(input: {
  projectId: string;
  idleMs: number;
  now: Date;
  days: TopicSetupDays;
  limit: number;
  /** Seeds the sample beyond the limit. */
  seed: string;
  /** "latest" takes the most recently active traces instead of a seeded sample. */
  order?: "random" | "latest";
  matching?: TopicSetupMatching;
  /** Leaves out traces already summarized for every facet. */
  summarized?: TopicSetupSummarized;
}): Promise<string[]> {
  const rows = await queryClickhouse<{ trace_id: string }>({
    query: `${topicSetupTracesSql(input.days, input.matching, input.summarized)}
      ORDER BY ${input.order === "latest" ? "last_ts DESC" : "cityHash64(trace_id, {seed: String})"}, trace_id
      LIMIT {limit: UInt32}`,
    params: {
      ...input.matching?.params,
      ...topicSetupParams(input.projectId, input.idleMs, input.now),
      ...summarizedParams(input.summarized),
      limit: input.limit,
      seed: input.seed,
    },
    tags: { route: "topics-setup-traces", projectId: input.projectId },
    preferredClickhouseService: "EventsReadOnly",
    clickhouseSettings: {
      max_execution_time: TOPIC_SETUP_SELECTION_TIMEOUT_SECONDS,
    },
  });
  return rows.map((row) => row.trace_id);
}

/**
 * What trace dispatch records for each trace: first and last event start and
 * event bytes. Reads the whole trace, which may start before the window.
 */
export async function getTopicSetupTraceBounds(input: {
  projectId: string;
  traceIds: string[];
  /** Start of the window the traces were selected from. */
  from: Date;
}) {
  if (!input.traceIds.length) return [];
  const rows = await queryClickhouse<{
    trace_id: string;
    min_start: string;
    max_start: string;
    event_bytes: string;
  }>({
    query: `
      SELECT
        trace_id,
        toUnixTimestamp64Milli(min(start_time)) AS min_start,
        toUnixTimestamp64Milli(max(start_time)) AS max_start,
        sum(event_bytes) AS event_bytes
      FROM events_core
      WHERE project_id = {projectId: String}
        AND start_time >= {from: DateTime64(3)} - ${OBSERVATIONS_TO_TRACE_INTERVAL}
        AND trace_id IN {traceIds: Array(String)}
        AND is_deleted = 0
      GROUP BY trace_id`,
    params: {
      projectId: input.projectId,
      traceIds: input.traceIds,
      from: convertDateToClickhouseDateTime(input.from),
    },
    tags: { route: "topics-setup-trace-bounds", projectId: input.projectId },
    preferredClickhouseService: "EventsReadOnly",
    clickhouseSettings: {
      max_execution_time: TOPIC_SETUP_SELECTION_TIMEOUT_SECONDS,
    },
  });
  return rows.map((row) => ({
    traceId: row.trace_id,
    minStart: Number(row.min_start),
    maxStart: Number(row.max_start),
    serializedEventBytes: Number(row.event_bytes),
  }));
}

// Above this many traces the estimate groups one hash bucket of them, so its memory stays bounded.
const COST_ESTIMATE_BUCKET_TRACES = 20_000;

/**
 * A seeded sample of the last 7 days' finished traces for the Topics cost
 * estimate, with each trace's start bounds and size. Large projects are read
 * through one xxHash32 bucket sized from a cheap uniqCombined pass. Reads one
 * hour before the window so traces that started there are left out rather
 * than cut off.
 */
export async function getTopicCostEstimateSample(input: {
  projectId: string;
  idleMs: number;
  now: Date;
  limit: number;
  seed: number;
  matching?: TopicSetupMatching;
}) {
  const where = (bucketed: boolean) => `
    WHERE project_id = {projectId: String}
      AND start_time >= {now: DateTime64(3)} - INTERVAL 7 DAY - INTERVAL 1 HOUR
      AND start_time <= {now: DateTime64(3)}
      AND trace_id != ''
      AND is_deleted = 0
      AND NOT startsWith(environment, {internalEnvironmentPrefix: String})
      AND environment NOT IN {publicInternalEnvironments: Array(String)}
      ${bucketed ? "AND xxHash32(trace_id) % {modulus: UInt32} = {bucket: UInt32}" : ""}
      ${
        input.matching
          ? `AND trace_id IN (SELECT id FROM (${input.matching.query})${bucketed ? " WHERE xxHash32(id) % {modulus: UInt32} = {bucket: UInt32}" : ""})`
          : ""
      }`;
  const params = {
    ...input.matching?.params,
    ...topicSetupParams(input.projectId, input.idleMs, input.now),
  };
  const settings = {
    preferredClickhouseService: "EventsReadOnly" as const,
    clickhouseSettings: {
      max_execution_time: TOPIC_SETUP_SELECTION_TIMEOUT_SECONDS,
    },
  };

  const [total] = await queryClickhouse<{ traces: string }>({
    query: `SELECT uniqCombined(trace_id) AS traces FROM events_core ${where(false)}`,
    params,
    tags: { route: "topics-cost-estimate-size", projectId: input.projectId },
    ...settings,
  });
  let modulus = 1;
  while (Number(total?.traces ?? 0) / modulus > COST_ESTIMATE_BUCKET_TRACES)
    modulus *= 2;

  const rows = await queryClickhouse<{
    sample: Array<[string, string, string, string, string]>;
  }>({
    query: `
      SELECT
        groupArraySample({limit: UInt32}, {seed: UInt64})(
          (trace_id, toString(min_start), toString(max_start), toString(rows), toString(event_bytes))
        ) AS sample
      FROM (
        SELECT
          trace_id,
          max(event_ts) AS last_ts,
          toUnixTimestamp64Milli(min(start_time)) AS min_start,
          toUnixTimestamp64Milli(max(start_time)) AS max_start,
          count() AS rows,
          sum(event_bytes) AS event_bytes
        FROM events_core
        ${where(modulus > 1)}
        GROUP BY trace_id
        HAVING last_ts < {now: DateTime64(3)} - toIntervalMillisecond({idleMs: UInt32})
          AND min_start >= toUnixTimestamp64Milli({now: DateTime64(3)} - INTERVAL 7 DAY)
      )`,
    params: {
      ...params,
      limit: input.limit,
      seed: input.seed,
      modulus,
      bucket: input.seed % modulus,
    },
    tags: { route: "topics-cost-estimate-sample", projectId: input.projectId },
    ...settings,
  });
  return (rows[0]?.sample ?? []).map(
    ([traceId, minStart, maxStart, eventRows, eventBytes]) => ({
      traceId,
      minStart: Number(minStart),
      maxStart: Number(maxStart),
      rows: Number(eventRows),
      eventBytes: Number(eventBytes),
    }),
  );
}

/**
 * Stored trace names of the last 7 days, most used first. Unlike the events
 * filter options, no root observation name stands in for a missing one, since
 * rule matching reads only the stored value.
 */
export async function getTopicSetupTraceNames(input: {
  projectId: string;
  now: Date;
}) {
  const rows = await queryClickhouse<{ name: string; count: string }>({
    query: `
      SELECT trace_name AS name, uniq(trace_id) AS count
      FROM events_core
      WHERE project_id = {projectId: String}
        AND start_time >= {now: DateTime64(3)} - INTERVAL 7 DAY
        AND trace_name != ''
        AND is_deleted = 0
      GROUP BY trace_name
      ORDER BY count DESC, name
      LIMIT 100`,
    params: {
      projectId: input.projectId,
      now: convertDateToClickhouseDateTime(input.now),
    },
    tags: { route: "topics-setup-trace-names", projectId: input.projectId },
    preferredClickhouseService: "EventsReadOnly",
    clickhouseSettings: {
      max_execution_time: TOPIC_SETUP_COUNT_TIMEOUT_SECONDS,
    },
  });
  return rows.map((row) => ({ value: row.name, count: Number(row.count) }));
}
