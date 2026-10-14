import { randomUUID } from "node:crypto";
import { prisma } from "../../db";
import { InvalidRequestError } from "../../errors";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import { QueueJobs, TraceBatchBackfillEventSchema } from "../queues";
import { TraceBatchQueue } from "../redis/traceBatch";
import { queryClickhouse } from "../repositories/clickhouse";
import { getTracingReadinessSettings } from "../tracingReadinessSettings";
import {
  TOPIC_BACKFILL_WINDOW_DAYS,
  type TopicBackfillSource,
  type TopicFacetRef,
} from "../../topics";
import { getTopicsModels } from "./model-config";
import { listTopicFacets, listTopicRules } from "./postgres";

const DAY_MS = 86_400_000;
// Matches the worker's production default; saving Topics always stores an idle time.
const DEFAULT_TRACE_IDLE_MS = 600_000;
const READY_CANDIDATE_FACTOR = 4;
const READY_CANDIDATE_CAP = 2_000;

type TopicBackfillTrace = {
  traceId: string;
  /** Earliest observation start of the whole trace, in epoch milliseconds. */
  minStart: number;
  /** Latest observation start of the whole trace, in epoch milliseconds. */
  maxStart: number;
  /** Stored totals that feed the trace-batch weight limits. */
  estimates: { eventUpdateCount: number; serializedEventBytes: number };
};

type BackfillRow = {
  trace_id: string;
  min_start_ms: string | number;
  max_start_ms: string | number;
  event_update_count: string | number;
  serialized_event_bytes: string | number;
};

const ROOT_OBSERVATION = "(parent_span_id = '' OR is_app_root = true)";

/**
 * Bounds and size totals read every stored observation of the selected traces,
 * found through the trace ID index rather than a time window, so the
 * trace-batch consumer's read covers traces that began before the window.
 * Unmerged row versions are counted like the dispatcher counts event writes.
 */
const TRACE_BOUNDS_CTE = `
  trace_bounds AS (
    SELECT
      trace_id,
      min(start_time) AS min_start,
      max(start_time) AS max_start,
      max(updated_at) AS last_seen,
      count() AS event_update_count,
      sum(event_bytes) AS serialized_event_bytes
    FROM events_core
    WHERE project_id = {projectId: String}
      AND trace_id IN (SELECT trace_id FROM candidates)
    GROUP BY trace_id
  )`;

const BACKFILL_COLUMNS = `
  trace_id,
  toUnixTimestamp64Milli(min_start) AS min_start_ms,
  toUnixTimestamp64Milli(max_start) AS max_start_ms,
  event_update_count,
  serialized_event_bytes`;

/**
 * `ready` mirrors the trace-batch readiness map: last admitted write
 * (`updated_at`) plus the project's idle time is in the past, and at least one
 * current facet version has no summary yet. Summarized traces are removed
 * before the candidate cut so an older backlog is still reached; summaries are
 * matched from a day before the window, and the consumer skips any it misses.
 * `random` samples traces whose root started in the window, without readiness
 * or summary checks.
 */
function backfillQuery(source: TopicBackfillSource) {
  if (source === "random")
    return `
      WITH
        candidates AS (
          SELECT trace_id
          FROM events_core
          WHERE project_id = {projectId: String}
            AND start_time >= {from: DateTime64(3)}
            AND start_time < {to: DateTime64(3)}
            AND ${ROOT_OBSERVATION}
            AND trace_id != ''
          GROUP BY trace_id
          ORDER BY cityHash64(trace_id, {seed: String}), trace_id
          LIMIT {limit: UInt32}
        ),
        ${TRACE_BOUNDS_CTE}
      SELECT ${BACKFILL_COLUMNS}
      FROM trace_bounds
      ORDER BY cityHash64(trace_id, {seed: String}), trace_id
    `;
  return `
    WITH
      summarized AS (
        SELECT trace_id
        FROM topic_facet_summaries
        WHERE project_id = {projectId: String}
          AND has(
            arrayZip({facetIds: Array(String)}, {facetVersions: Array(UInt32)}),
            (facet_id, facet_version)
          )
          AND unit_start_time >= {from: DateTime64(3)} - INTERVAL 1 DAY
          AND trace_id != ''
        GROUP BY trace_id
        HAVING uniqExact(facet_id, facet_version) = length({facetIds: Array(String)})
      ),
      candidates AS (
        SELECT trace_id, max(start_time) AS root_start
        FROM events_core
        WHERE project_id = {projectId: String}
          AND start_time >= {from: DateTime64(3)}
          AND start_time < {readyTo: DateTime64(3)}
          AND ${ROOT_OBSERVATION}
          AND trace_id != ''
          AND trace_id NOT IN (SELECT trace_id FROM summarized)
        GROUP BY trace_id
        ORDER BY root_start DESC, trace_id
        LIMIT {candidates: UInt32}
      ),
      ${TRACE_BOUNDS_CTE}
    SELECT ${BACKFILL_COLUMNS}
    FROM trace_bounds
    WHERE last_seen + toIntervalMillisecond({idleMs: UInt32}) < {now: DateTime64(3)}
    ORDER BY max_start DESC, trace_id
    LIMIT {limit: UInt32}
  `;
}

/** Selects up to `limit` traces from the last seven days for a Topics backfill. */
async function selectTopicBackfillTraces(input: {
  projectId: string;
  source: TopicBackfillSource;
  limit: number;
  idleMs: number;
  facets: TopicFacetRef[];
  seed: string;
  now?: Date;
}): Promise<TopicBackfillTrace[]> {
  if (input.source === "ready" && input.facets.length === 0) return [];
  const now = input.now ?? new Date();
  const from = new Date(now.getTime() - TOPIC_BACKFILL_WINDOW_DAYS * DAY_MS);
  const rows = await queryClickhouse<BackfillRow>({
    query: backfillQuery(input.source),
    params: {
      projectId: input.projectId,
      from: convertDateToClickhouseDateTime(from),
      to: convertDateToClickhouseDateTime(now),
      readyTo: convertDateToClickhouseDateTime(
        new Date(now.getTime() - input.idleMs),
      ),
      now: convertDateToClickhouseDateTime(now),
      idleMs: input.idleMs,
      limit: input.limit,
      candidates: Math.min(
        input.limit * READY_CANDIDATE_FACTOR,
        READY_CANDIDATE_CAP,
      ),
      facetIds: input.facets.map(({ facetId }) => facetId),
      facetVersions: input.facets.map(({ version }) => version),
      seed: input.seed,
    },
    preferredClickhouseService: "EventsReadOnly",
    tags: { projectId: input.projectId, route: "topics-backfill-selection" },
    clickhouseSettings: {
      max_threads: 2,
      max_execution_time: 30,
      timeout_overflow_mode: "throw",
    },
  });
  return rows.map((row) => ({
    traceId: row.trace_id,
    minStart: Number(row.min_start_ms),
    maxStart: Number(row.max_start_ms),
    estimates: {
      eventUpdateCount: Number(row.event_update_count),
      serializedEventBytes: Number(row.serialized_event_bytes),
    },
  }));
}

/**
 * Selects traces and hands them to the trace-batch queue as one backfill job.
 * The worker packs that job with the dispatcher's batching strategy. Its
 * trace-batch jobs run with the saved models and the rule's facets whether or
 * not automatic processing is on, and the rule's sampling does not apply.
 */
export async function scheduleTopicBackfill(input: {
  projectId: string;
  source: TopicBackfillSource;
  limit: number;
}): Promise<{ traceCount: number }> {
  const [config, models, facets, rules, readiness] = await Promise.all([
    prisma.topicConfig.findUnique({
      where: { projectId: input.projectId },
      select: { blockedAt: true, blockMessage: true },
    }),
    getTopicsModels(input.projectId),
    listTopicFacets(input.projectId),
    listTopicRules(input.projectId),
    getTracingReadinessSettings(input.projectId),
  ]);
  const rule = rules[0];
  if (!models || !rule)
    throw new InvalidRequestError(
      "Choose every model and save Configure Topics before running a backfill.",
    );
  if (config?.blockedAt)
    throw new InvalidRequestError(
      `Topics is paused: ${config.blockMessage ?? "a model connection failed"}. Fix the models in Configure Topics before running a backfill.`,
    );
  const queue = TraceBatchQueue.getInstance();
  if (!queue)
    throw new InvalidRequestError(
      "Backfills need the trace-batch queue, which this deployment does not run.",
    );
  const selected = new Set(rule.facetIds);
  const traces = await selectTopicBackfillTraces({
    ...input,
    idleMs: readiness.traceIdleMs ?? DEFAULT_TRACE_IDLE_MS,
    facets: facets.flatMap((facet) => {
      const version = facet.versions[0]?.version;
      return version && selected.has(facet.id)
        ? [{ facetId: facet.id, version }]
        : [];
    }),
    seed: randomUUID(),
  });
  if (traces.length === 0) return { traceCount: 0 };
  const id = randomUUID();
  const event = TraceBatchBackfillEventSchema.parse({
    id,
    timestamp: new Date(),
    name: QueueJobs.TraceBatchBackfill,
    payload: {
      traces: traces.map((trace) => ({
        projectId: input.projectId,
        ...trace,
        revision: randomUUID(),
      })),
    },
  });
  await queue.add(QueueJobs.TraceBatchBackfill, event, { jobId: id });
  return { traceCount: traces.length };
}
