import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type { Observation } from "@langfuse/shared";
import {
  assembleTranscriptContext,
  convertObservation,
  createTraceBatchInputStorage,
  getTraceBatchEventStream,
  instrumentAsync,
  isInternalEvalEnvironment,
  logger,
  orderObservations,
  QueueJobs,
  recordIncrement,
  TopicsTraceQueue,
  TRACE_BATCH_INPUT_MAX_CHARACTERS,
  traceException,
  type EventsDispatchEventSchema,
  type TopicsTraceEventType,
} from "@langfuse/shared/src/server";
import {
  getTopicsProcessingSampling,
  listTopicFacets,
  listTopicRules,
} from "@langfuse/shared/topics/server";
import { env } from "../../env";
import { isTraceDispatchEnabled } from "../traceBatching/traceBatchSampling";
import { getTraceBatchShard } from "../traceBatching/traceBatchReadiness";
import {
  evalRecording,
  getRecordingBoundsKey,
  getRecordingKeys,
  RESTORE_RECORDING_SCRIPT,
} from "../traceBatching/traceRuleRecording";

type EventsDispatchEvent = z.infer<typeof EventsDispatchEventSchema>;
type DispatchTrace = EventsDispatchEvent["payload"]["traces"][number];
type TopicsTraceRule = TopicsTraceEventType["rules"][number];
type TraceOutcome =
  | { outcome: "enqueued" | "too_large" | "missing" }
  | { outcome: "skipped"; reason: "no_rules" | "internal_environment" }
  | { outcome: "failed"; reason: string; retry: boolean };
type DispatchObservation = Observation & {
  eventTimestamp: string;
  sessionId: string | null;
};

export const JOB_MAX_AGE_MS = 2 * 60 * 60_000;
// Bounds transcripts held in memory while their uploads run.
const UPLOAD_CONCURRENCY = 10;
// Backoff before the first, second and third retry; a fourth failure drops the trace.
const RETRY_BACKOFF_MS = [5, 15, 45].map((minutes) => minutes * 60_000);
const REDIS_BATCH_SIZE = 50;

const inputStorage = createTraceBatchInputStorage();
const traceKey = (projectId: string, traceId: string) =>
  JSON.stringify([projectId, traceId]);

export function isEventsDispatchEnabled(): boolean {
  return (
    isTraceDispatchEnabled() && env.LANGFUSE_EVENTS_DISPATCH_ENABLED === "true"
  );
}

/** Rules by ID with their facets' current versions; empty while Topics is inactive for the project. */
async function loadTopicsRules(
  projectId: string,
): Promise<Map<string, TopicsTraceRule>> {
  if ((await getTopicsProcessingSampling(projectId)) === 0) return new Map();
  const [facets, rules] = await Promise.all([
    listTopicFacets(projectId),
    listTopicRules(projectId),
  ]);
  const result = new Map<string, TopicsTraceRule>();
  for (const rule of rules) {
    const selected = new Set(rule.facetIds);
    const refs = facets.flatMap((facet) => {
      const version = facet.versions[0];
      return selected.has(facet.id) && version
        ? [{ facetId: facet.id, version: version.version }]
        : [];
    });
    if (refs.length > 0) result.set(rule.id, { ruleId: rule.id, facets: refs });
  }
  return result;
}

/** Orders events like manual processing: event_ts, then span ID, then environment. */
function newestEvent(observations: DispatchObservation[]) {
  return observations.reduce<DispatchObservation | undefined>(
    (current, row) => {
      if (!current) return row;
      if (row.eventTimestamp !== current.eventTimestamp)
        return row.eventTimestamp > current.eventTimestamp ? row : current;
      if (row.id !== current.id) return row.id > current.id ? row : current;
      return row.environment > current.environment ? row : current;
    },
    undefined,
  );
}

/** Stores one trace's transcript, then enqueues its Topics job; never throws. */
function dispatchTrace(
  trace: DispatchTrace,
  rules: TopicsTraceRule[],
  observations: DispatchObservation[],
): Promise<TraceOutcome> {
  const { projectId, traceId, revision } = trace;
  return instrumentAsync(
    { name: "events-dispatch-trace" },
    async (span): Promise<TraceOutcome> => {
      span.setAttributes({
        "langfuse.project.id": projectId,
        "langfuse.trace.id": traceId,
        "langfuse.events_dispatch.revision": revision,
        "langfuse.events_dispatch.observation_count": observations.length,
        "langfuse.events_dispatch.failed_count": trace.failedCount ?? 0,
      });
      const result = await (async (): Promise<TraceOutcome> => {
        const latest = newestEvent(observations)!;
        if (isInternalEvalEnvironment(latest.environment))
          return { outcome: "skipped", reason: "internal_environment" };
        let context;
        try {
          context = assembleTranscriptContext(orderObservations(observations));
        } catch (error) {
          // Assembly is deterministic, so a retry would fail the same way.
          traceException(error, span);
          return { outcome: "failed", reason: "assembly", retry: false };
        }
        const reference = { projectId, traceId, revision };
        let stored;
        try {
          stored = await inputStorage.put(reference, {
            transcript: context?.transcript ?? null,
            executionIssues: context?.executionIssues ?? [],
            traceContext: {
              sessionId:
                newestEvent(observations.filter((row) => row.sessionId))
                  ?.sessionId ?? null,
              traceTimestamp: new Date(
                Math.min(...observations.map((row) => row.startTime.getTime())),
              ).toISOString(),
              environment: latest.environment,
              traceName: observations[0].name,
            },
          });
        } catch (error) {
          traceException(error, span);
          return { outcome: "failed", reason: "input_storage", retry: true };
        }
        span.setAttribute(
          "langfuse.events_dispatch.transcript_json_characters",
          stored.jsonLength,
        );
        if (stored.outcome === "too_large") {
          traceException(
            new Error(
              `Transcript exceeds ${TRACE_BATCH_INPUT_MAX_CHARACTERS} characters`,
            ),
            span,
          );
          return { outcome: "too_large" };
        }
        try {
          const queue = TopicsTraceQueue.getInstance({
            shardingKey: `${projectId}-${traceId}`,
          });
          if (!queue) throw new Error("Topics trace queue is unavailable.");
          await queue.add(
            QueueJobs.TopicsTraceJob,
            {
              name: QueueJobs.TopicsTraceJob,
              id: randomUUID(),
              timestamp: new Date(),
              payload: { ...reference, rules },
            },
            {
              deduplication: {
                id: JSON.stringify([projectId, traceId, revision]),
                // A retried job within its lifetime never enqueues a trace revision twice.
                ttl: JOB_MAX_AGE_MS,
              },
            },
          );
        } catch (error) {
          traceException(error, span);
          return { outcome: "failed", reason: "enqueue", retry: true };
        }
        return { outcome: "enqueued" };
      })();
      span.setAttribute("langfuse.events_dispatch.outcome", result.outcome);
      if ("reason" in result)
        span.setAttribute("langfuse.events_dispatch.reason", result.reason);
      return result;
    },
  );
}

/** Returns failed traces to the pending map with backoff; drops them after the last retry. */
async function restoreFailedTraces(traces: DispatchTrace[]): Promise<void> {
  const results = { restored: 0, merged: 0, expired: 0, dropped: 0 };
  const shards = new Map<number, DispatchTrace[]>();
  for (const trace of traces) {
    const failedCount = trace.failedCount ?? 0;
    if (failedCount >= RETRY_BACKOFF_MS.length) {
      results.dropped++;
      logger.warn("Events dispatch dropped trace after retries", {
        projectId: trace.projectId,
        traceId: trace.traceId,
        failedCount,
      });
      continue;
    }
    const shard = getTraceBatchShard(traceKey(trace.projectId, trace.traceId));
    shards.set(shard, [...(shards.get(shard) ?? []), trace]);
  }
  for (const [shard, entries] of shards) {
    const { pending, due } = getRecordingKeys(shard);
    for (let offset = 0; offset < entries.length; offset += REDIS_BATCH_SIZE) {
      const chunk = entries.slice(offset, offset + REDIS_BATCH_SIZE);
      const members = chunk.map(({ projectId, traceId }) =>
        traceKey(projectId, traceId),
      );
      const codes = (await evalRecording(
        RESTORE_RECORDING_SCRIPT,
        [
          pending,
          due,
          ...members.map((member) => getRecordingBoundsKey(shard, member)),
        ],
        [
          env.LANGFUSE_TRACE_BATCH_PENDING_TTL_MS,
          ...chunk.flatMap((trace, index) => {
            const failedCount = trace.failedCount ?? 0;
            return [
              members[index],
              // A fresh revision stores the retry's transcript under a new key.
              randomUUID(),
              JSON.stringify(trace.ruleIds ?? []),
              failedCount + 1,
              RETRY_BACKOFF_MS[failedCount],
            ];
          }),
        ],
      )) as number[];
      for (const code of codes) {
        const result = (["expired", "restored", "merged"] as const)[
          Number(code)
        ];
        results[result]++;
      }
    }
  }
  for (const [result, count] of Object.entries(results))
    if (count > 0)
      recordIncrement("langfuse.events_dispatch.restored_traces", count, {
        result,
      });
}

function recordOutcomes(outcomes: TraceOutcome[]): void {
  const counts = new Map<string, number>();
  for (const result of outcomes) {
    const key = JSON.stringify([
      result.outcome,
      "reason" in result ? result.reason : null,
    ]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [key, count] of counts) {
    const [outcome, reason] = JSON.parse(key) as [string, string | null];
    recordIncrement("langfuse.events_dispatch.trace_outcomes", count, {
      outcome,
      ...(reason ? { reason } : {}),
    });
  }
}

/**
 * Reads the job's ready traces, stores each transcript and enqueues one Topics
 * job per trace with the rules recorded at ingestion. Per-trace failures return
 * to Redis; a failed read throws so BullMQ retries the whole job.
 */
export async function processEventsDispatchJob(
  event: EventsDispatchEvent,
): Promise<Record<string, number>> {
  const outcomes: TraceOutcome[] = [];
  const failed: DispatchTrace[] = [];
  const readable = new Map<
    string,
    { trace: DispatchTrace; rules: TopicsTraceRule[] }
  >();
  const projectRules = new Map<string, Promise<Map<string, TopicsTraceRule>>>();
  let unknownRules = 0;
  for (const trace of event.payload.traces) {
    let rulesById = projectRules.get(trace.projectId);
    if (!rulesById) {
      rulesById = loadTopicsRules(trace.projectId);
      projectRules.set(trace.projectId, rulesById);
    }
    let rules: TopicsTraceRule[];
    try {
      const known = await rulesById;
      const ids = trace.ruleIds ?? [];
      rules = ids.flatMap((id) => known.get(id) ?? []);
      unknownRules += ids.length - rules.length;
    } catch (error) {
      logger.warn("Events dispatch could not load Topics rules", {
        projectId: trace.projectId,
        error: error instanceof Error ? error.message : String(error),
      });
      outcomes.push({ outcome: "failed", reason: "rules", retry: true });
      failed.push(trace);
      continue;
    }
    if (rules.length === 0)
      outcomes.push({ outcome: "skipped", reason: "no_rules" });
    else
      readable.set(traceKey(trace.projectId, trace.traceId), { trace, rules });
  }
  // Includes the trace-dispatch experiment sentinel and deleted or non-Topics rules.
  if (unknownRules > 0)
    recordIncrement("langfuse.events_dispatch.unresolved_rules", unknownRules);

  const inFlight = new Set<Promise<void>>();
  const seen = new Set<string>();
  const startDispatch = (key: string, observations: DispatchObservation[]) => {
    seen.add(key);
    const { trace, rules } = readable.get(key)!;
    const task: Promise<void> = dispatchTrace(trace, rules, observations)
      .then((result) => {
        outcomes.push(result);
        if (result.outcome === "failed" && result.retry) failed.push(trace);
      })
      .finally(() => inFlight.delete(task));
    inFlight.add(task);
  };
  try {
    let current: DispatchObservation[] = [];
    let currentKey: string | undefined;
    for await (const row of getTraceBatchEventStream(
      { traces: [...readable.values()].map(({ trace }) => trace) },
      { queryId: randomUUID() },
    )) {
      const key = traceKey(row.project_id, row.trace_id);
      if (currentKey !== undefined && key !== currentKey) {
        startDispatch(currentKey, current);
        current = [];
        while (inFlight.size >= UPLOAD_CONCURRENCY)
          await Promise.race(inFlight);
      }
      currentKey = key;
      current.push({
        ...convertObservation({
          ...row,
          id: row.span_id,
          parent_observation_id: row.parent_span_id,
          // These required converter fields are not used by the transcript.
          created_at: row.event_ts,
          updated_at: row.event_ts,
          is_deleted: 0,
          provided_usage_details: {},
          provided_cost_details: {},
          usage_details: {},
          cost_details: {},
        }),
        eventTimestamp: row.event_ts,
        sessionId: row.session_id || null,
      });
    }
    // Reaching EOF completes the last trace; a failed stream must not flush it.
    if (currentKey !== undefined) startDispatch(currentKey, current);
  } finally {
    await Promise.all(inFlight);
  }
  for (const key of readable.keys())
    if (!seen.has(key)) outcomes.push({ outcome: "missing" });

  recordOutcomes(outcomes);
  if (failed.length > 0) await restoreFailedTraces(failed);
  const counts: Record<string, number> = {};
  for (const { outcome } of outcomes)
    counts[outcome] = (counts[outcome] ?? 0) + 1;
  return counts;
}
