import { randomUUID } from "node:crypto";
import pLimit from "p-limit";
import type { z } from "zod";
import {
  assembleTranscriptContext,
  createTraceBatchInputStorage,
  getTraceBatchEventStream,
  instrumentAsync,
  isInternalEvalEnvironment,
  logger,
  orderObservations,
  recordIncrement,
  TRACE_BATCH_INPUT_MAX_CHARACTERS,
  traceException,
  type EventsDispatchEventSchema,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import { EXPERIMENT_RULE_ID } from "../evaluation/traceTranscriptEval/scheduleTraceTranscriptEvals";
import { isTraceDispatchEnabled } from "../traceBatching/traceBatchSampling";
import { getTraceBatchShard } from "../traceBatching/traceBatchReadiness";
import {
  evalRecording,
  getRecordingBoundsKey,
  getRecordingKeys,
  RESTORE_RECORDING_SCRIPT,
} from "../traceBatching/traceRuleRecording";
import { routeRules } from "./consumers";
import {
  newestEvent,
  newestSessionId,
  toTraceEventObservation,
  traceEventPayloadBytes,
  traceKey,
  type TraceEventObservation,
} from "./traceEvents";

type DispatchTrace = z.infer<
  typeof EventsDispatchEventSchema
>["payload"]["traces"][number];
type ConsumerJobs = Awaited<ReturnType<typeof routeRules>>["jobs"];
type TraceOutcome =
  | { outcome: "enqueued" | "stored" | "too_large" | "missing" }
  | { outcome: "skipped"; reason: "no_rules" | "internal_environment" }
  | {
      outcome: "failed";
      reason: string;
      trace: DispatchTrace;
      retryRuleIds: string[];
    };
type ReadableTrace = { trace: DispatchTrace; jobs: ConsumerJobs };

// Backoff before the first, second and third retry; a fourth failure drops the trace.
const RETRY_BACKOFF_MS = [5, 15, 45].map((minutes) => minutes * 60_000);
const REDIS_BATCH_SIZE = 50;

const inputStorage = createTraceBatchInputStorage();

export function isEventsDispatchEnabled(): boolean {
  return (
    isTraceDispatchEnabled() && env.LANGFUSE_EVENTS_DISPATCH_ENABLED === "true"
  );
}

/**
 * Routes each trace's recorded rules to consumers. Traces without any end here,
 * before ClickHouse, unless the store-all experiment keeps them for storage only.
 */
async function selectTraces(traces: DispatchTrace[]) {
  const readable = new Map<string, ReadableTrace>();
  const outcomes: TraceOutcome[] = [];
  let unresolved = 0;
  const withoutConsumers = (trace: DispatchTrace) => {
    if (env.LANGFUSE_EVENTS_DISPATCH_STORE_ALL_TRACES === "true")
      readable.set(traceKey(trace.projectId, trace.traceId), {
        trace,
        jobs: [],
      });
    else outcomes.push({ outcome: "skipped", reason: "no_rules" });
  };
  for (const trace of traces) {
    const ruleIds = (trace.ruleIds ?? []).filter(
      (id) => id !== EXPERIMENT_RULE_ID,
    );
    if (ruleIds.length === 0) {
      withoutConsumers(trace);
      continue;
    }
    let routed;
    try {
      routed = await routeRules(trace.projectId, ruleIds);
    } catch (error) {
      logger.warn("Events dispatch could not load trace rules", {
        projectId: trace.projectId,
        traceId: trace.traceId,
        revision: trace.revision,
        error: error instanceof Error ? error.message : String(error),
      });
      outcomes.push({
        outcome: "failed",
        reason: "rules",
        trace,
        retryRuleIds: ruleIds,
      });
      continue;
    }
    // Deleted, inactive or blocked rules; their consumers would find nothing to run.
    unresolved += routed.unresolved.length;
    if (routed.jobs.length === 0) withoutConsumers(trace);
    else
      readable.set(traceKey(trace.projectId, trace.traceId), {
        trace,
        jobs: routed.jobs,
      });
  }
  if (unresolved > 0)
    recordIncrement("langfuse.events_dispatch.unresolved_rules", unresolved);
  return { readable, outcomes };
}

/** Stores one trace's transcript, then enqueues each consumer's job; never throws. */
function dispatchTrace(
  { trace, jobs }: ReadableTrace,
  observations: TraceEventObservation[],
): Promise<TraceOutcome> {
  const { projectId, traceId, revision } = trace;
  const allRuleIds = jobs.flatMap((job) => job.ruleIds);
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
      const finish = (result: TraceOutcome) => {
        span.setAttribute("langfuse.events_dispatch.outcome", result.outcome);
        if ("reason" in result)
          span.setAttribute("langfuse.events_dispatch.reason", result.reason);
        return result;
      };
      const latest = newestEvent(observations)!;
      if (isInternalEvalEnvironment(latest.environment))
        return finish({ outcome: "skipped", reason: "internal_environment" });

      // Assembly is synchronous; yielding first lets the ClickHouse socket drain between traces.
      await new Promise((resolve) => setImmediate(resolve));
      const reference = { projectId, traceId, revision };
      let stored;
      try {
        const context = assembleTranscriptContext(
          orderObservations(observations),
        );
        stored = await inputStorage.put(reference, {
          transcript: context?.transcript ?? null,
          executionIssues: context?.executionIssues ?? [],
          traceContext: {
            sessionId: newestSessionId(observations),
            traceTimestamp: new Date(
              Math.min(...observations.map((row) => row.startTime.getTime())),
            ).toISOString(),
            environment: latest.environment,
            traceName: observations[0].name,
          },
        });
      } catch (error) {
        traceException(error, span);
        return finish({
          outcome: "failed",
          reason: "input_storage",
          trace,
          retryRuleIds: allRuleIds,
        });
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
        return finish({ outcome: "too_large" });
      }

      const failedRuleIds: string[] = [];
      await Promise.all(
        jobs.map(({ consumer, ruleIds }) =>
          consumer.enqueue(reference, ruleIds).catch((error) => {
            traceException(error, span);
            failedRuleIds.push(...ruleIds);
          }),
        ),
      );
      // Only failed consumers retry; the others already hold this revision's job.
      if (failedRuleIds.length > 0)
        return finish({
          outcome: "failed",
          reason: "enqueue",
          trace,
          retryRuleIds: failedRuleIds,
        });
      return finish({ outcome: jobs.length > 0 ? "enqueued" : "stored" });
    },
  );
}

/**
 * Streams the readable traces and dispatches each one as soon as its rows end.
 * Reading pauses only above the pending-bytes cap, so slow uploads do not idle the socket.
 */
async function streamTraces(
  readable: Map<string, ReadableTrace>,
): Promise<TraceOutcome[]> {
  const outcomes: TraceOutcome[] = [];
  const pending = new Set<Promise<void>>();
  const limit = pLimit(env.LANGFUSE_TOPICS_TRACE_CONCURRENCY);
  const seen = new Set<string>();
  let pendingBytes = 0;
  const start = (
    key: string,
    observations: TraceEventObservation[],
    bytes: number,
  ) => {
    seen.add(key);
    pendingBytes += bytes;
    const task: Promise<void> = limit(() =>
      dispatchTrace(readable.get(key)!, observations),
    )
      .then((result) => {
        outcomes.push(result);
      })
      .finally(() => {
        pendingBytes -= bytes;
        pending.delete(task);
      });
    pending.add(task);
  };

  try {
    let current: TraceEventObservation[] = [];
    let currentKey: string | undefined;
    let currentBytes = 0;
    for await (const row of getTraceBatchEventStream(
      { traces: [...readable.values()].map(({ trace }) => trace) },
      {
        maxThreads: env.LANGFUSE_TRACE_BATCH_MAX_THREADS,
        maxBlockSize: env.LANGFUSE_TRACE_BATCH_MAX_BLOCK_SIZE,
        requestTimeoutMs: env.LANGFUSE_TRACE_BATCH_REQUEST_TIMEOUT_MS,
        queryId: randomUUID(),
      },
    )) {
      const key = traceKey(row.project_id, row.trace_id);
      if (currentKey !== undefined && key !== currentKey) {
        start(currentKey, current, currentBytes);
        current = [];
        currentBytes = 0;
        while (
          pendingBytes > env.LANGFUSE_TRACE_BATCH_MAX_PENDING_SUMMARY_BYTES
        )
          await Promise.race(pending);
      }
      currentKey = key;
      currentBytes += traceEventPayloadBytes(row);
      current.push(toTraceEventObservation(row));
    }
    // Reaching EOF completes the last trace; a failed stream must not flush it.
    if (currentKey !== undefined) start(currentKey, current, currentBytes);
  } finally {
    // Started traces finish even when the read fails; a job retry deduplicates them.
    await Promise.all(pending);
  }
  for (const key of readable.keys())
    if (!seen.has(key)) outcomes.push({ outcome: "missing" });
  return outcomes;
}

/** Returns failed traces to the pending map with backoff; drops them after the last retry. */
async function restoreFailedTraces(
  failed: { trace: DispatchTrace; ruleIds: string[] }[],
): Promise<void> {
  const results = { restored: 0, merged: 0, expired: 0, dropped: 0 };
  const shards = new Map<number, typeof failed>();
  for (const entry of failed) {
    const { projectId, traceId } = entry.trace;
    const failedCount = entry.trace.failedCount ?? 0;
    if (failedCount >= RETRY_BACKOFF_MS.length) {
      results.dropped++;
      logger.warn("Events dispatch dropped trace after retries", {
        projectId,
        traceId,
        failedCount,
      });
      continue;
    }
    const shard = getTraceBatchShard(traceKey(projectId, traceId));
    shards.set(shard, [...(shards.get(shard) ?? []), entry]);
  }
  for (const [shard, entries] of shards) {
    const { pending, due } = getRecordingKeys(shard);
    for (let offset = 0; offset < entries.length; offset += REDIS_BATCH_SIZE) {
      const chunk = entries.slice(offset, offset + REDIS_BATCH_SIZE);
      const members = chunk.map(({ trace }) =>
        traceKey(trace.projectId, trace.traceId),
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
          ...chunk.flatMap(({ trace, ruleIds }, index) => {
            const failedCount = trace.failedCount ?? 0;
            return [
              members[index],
              trace.revision,
              // A fresh revision stores the retry's transcript under a new key.
              randomUUID(),
              JSON.stringify(ruleIds),
              failedCount + 1,
              RETRY_BACKOFF_MS[failedCount],
            ];
          }),
        ],
      )) as number[];
      for (const code of codes)
        results[(["expired", "restored", "merged"] as const)[Number(code)]]++;
    }
  }
  for (const [result, count] of Object.entries(results))
    if (count > 0)
      recordIncrement("langfuse.events_dispatch.restored_traces", count, {
        result,
      });
}

function recordOutcomes(outcomes: TraceOutcome[]): Record<string, number> {
  const counts = new Map<string, number>();
  const totals: Record<string, number> = {};
  for (const result of outcomes) {
    const key = JSON.stringify([
      result.outcome,
      "reason" in result ? result.reason : null,
    ]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    totals[result.outcome] = (totals[result.outcome] ?? 0) + 1;
  }
  for (const [key, count] of counts) {
    const [outcome, reason] = JSON.parse(key) as [string, string | null];
    recordIncrement("langfuse.events_dispatch.trace_outcomes", count, {
      outcome,
      ...(reason ? { reason } : {}),
    });
  }
  return totals;
}

/**
 * Stores each ready trace's transcript and enqueues one job per consumer its
 * recorded rules select. Per-trace failures return to Redis; a failed read
 * throws so BullMQ retries the whole job.
 */
export async function processEventsDispatchJob(
  event: z.infer<typeof EventsDispatchEventSchema>,
): Promise<Record<string, number>> {
  const { readable, outcomes } = await selectTraces(event.payload.traces);
  if (readable.size > 0) outcomes.push(...(await streamTraces(readable)));
  // Storage-only traces have no consumer to retry for.
  const failed = outcomes.flatMap((result) =>
    result.outcome === "failed" && result.retryRuleIds.length > 0
      ? [{ trace: result.trace, ruleIds: result.retryRuleIds }]
      : [],
  );
  if (failed.length > 0) await restoreFailedTraces(failed);
  return recordOutcomes(outcomes);
}
