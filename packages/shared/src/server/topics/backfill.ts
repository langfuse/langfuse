import { randomUUID } from "node:crypto";
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
import { getEnabledTopicsModels } from "./model-config";
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
};

type BackfillRow = {
  trace_id: string;
  min_start_ms: string | number;
  max_start_ms: string | number;
};

const ROOT_OBSERVATION = "(parent_span_id = '' OR is_app_root = true)";

/**
 * Bounds read every observation of the selected traces, not only the root, so
 * the trace-batch consumer's read window covers the whole trace. A trace can
 * start up to a day before its latest root observation.
 */
const TRACE_BOUNDS_CTE = `
  trace_bounds AS (
    SELECT
      trace_id,
      min(start_time) AS min_start,
      max(start_time) AS max_start,
      max(updated_at) AS last_seen
    FROM events_core
    WHERE project_id = {projectId: String}
      AND start_time >= (SELECT min(root_start) FROM candidates) - INTERVAL 1 DAY
      AND trace_id IN (SELECT trace_id FROM candidates)
    GROUP BY trace_id
  )`;

/**
 * `ready` mirrors the trace-batch readiness map: last admitted write
 * (`updated_at`) plus the project's idle time is in the past, and at least one
 * current facet version has no summary yet. `random` samples traces whose root
 * started in the window, without readiness or summary checks.
 */
function backfillQuery(source: TopicBackfillSource) {
  if (source === "random")
    return `
      WITH
        candidates AS (
          SELECT trace_id, max(start_time) AS root_start
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
      SELECT
        trace_id,
        toUnixTimestamp64Milli(min_start) AS min_start_ms,
        toUnixTimestamp64Milli(max_start) AS max_start_ms
      FROM trace_bounds
      ORDER BY cityHash64(trace_id, {seed: String}), trace_id
    `;
  return `
    WITH
      candidates AS (
        SELECT trace_id, max(start_time) AS root_start
        FROM events_core
        WHERE project_id = {projectId: String}
          AND start_time >= {from: DateTime64(3)}
          AND start_time < {readyTo: DateTime64(3)}
          AND ${ROOT_OBSERVATION}
          AND trace_id != ''
        GROUP BY trace_id
        ORDER BY root_start DESC, trace_id
        LIMIT {candidates: UInt32}
      ),
      ${TRACE_BOUNDS_CTE},
      summarized AS (
        SELECT trace_id
        FROM topic_facet_summaries
        WHERE project_id = {projectId: String}
          AND has(
            arrayZip({facetIds: Array(String)}, {facetVersions: Array(UInt32)}),
            (facet_id, facet_version)
          )
          AND unit_start_time >= (SELECT min(root_start) FROM candidates) - INTERVAL 1 DAY
          AND trace_id IN (SELECT trace_id FROM candidates)
        GROUP BY trace_id
        HAVING uniqExact(facet_id, facet_version) = length({facetIds: Array(String)})
      )
    SELECT
      trace_id,
      toUnixTimestamp64Milli(min_start) AS min_start_ms,
      toUnixTimestamp64Milli(max_start) AS max_start_ms
    FROM trace_bounds
    WHERE last_seen + toIntervalMillisecond({idleMs: UInt32}) < {now: DateTime64(3)}
      AND trace_id NOT IN (SELECT trace_id FROM summarized)
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
  }));
}

/** The saved rule's facets at their latest version; without a rule, every facet. */
async function currentFacetVersions(
  projectId: string,
): Promise<TopicFacetRef[]> {
  const [facets, rules] = await Promise.all([
    listTopicFacets(projectId),
    listTopicRules(projectId),
  ]);
  const selected = rules[0] ? new Set(rules[0].facetIds) : null;
  return facets.flatMap((facet) => {
    const version = facet.versions[0]?.version;
    if (!version || (selected && !selected.has(facet.id))) return [];
    return [{ facetId: facet.id, version }];
  });
}

/**
 * Selects traces and hands them to the trace-batch queue as one backfill job.
 * The worker packs that job with the dispatcher's batching strategy, and the
 * trace-batch consumer applies the project's facets and sampling, as for
 * traces from the readiness map.
 */
export async function scheduleTopicBackfill(input: {
  projectId: string;
  source: TopicBackfillSource;
  limit: number;
}): Promise<{ traceCount: number }> {
  const [models, readiness, facets] = await Promise.all([
    getEnabledTopicsModels([input.projectId]),
    getTracingReadinessSettings(input.projectId),
    currentFacetVersions(input.projectId),
  ]);
  if (!models.has(input.projectId))
    throw new InvalidRequestError(
      "Turn on automatic processing with three tested models and save before backfilling.",
    );
  const queue = TraceBatchQueue.getInstance();
  if (!queue)
    throw new InvalidRequestError(
      "Backfills need the trace-batch queue, which this deployment does not run.",
    );
  const traces = await selectTopicBackfillTraces({
    ...input,
    idleMs: readiness.traceIdleMs ?? DEFAULT_TRACE_IDLE_MS,
    facets,
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
