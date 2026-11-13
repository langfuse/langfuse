import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@langfuse/shared/src/db";
import {
  EventsDispatchQueue,
  getTopicSetupTraceBounds,
  getTopicSetupTraceIds,
  logger,
  QueueJobs,
  TOPIC_SETUP_WINDOW_DAYS,
} from "@langfuse/shared/src/server";
import {
  countTopicTraceSummaries,
  enqueueTopicExecution,
  isTopicsProjectEnabled,
  readTopicExecutionSummary,
  readTopicSnapshotSummarizing,
  topicMatchingTraceIdsQuery,
  writeTopicExecution,
  writeTopicSnapshotSummarizing,
  type TopicSnapshotSummarizing,
} from "@langfuse/shared/topics/server";
import type { TopicExecutionSummary } from "@langfuse/shared/topics";
import { env } from "../../env";
import { traceKey } from "../eventsDispatch/traceEvents";
import { resolveTraceIdleMs } from "../traceBatching/traceBatchReadiness";
import {
  selectTraceBatches,
  toLimit,
  type PendingTrace,
} from "../traceBatching/traceBatchSelection";

const DAY_MS = 86_400_000;
const SETTLED_SHARE = 0.9;
const STALL_MS = 60_000;
const DEADLINE_MS = 8 * 60_000;
// Spreads dispatch so up to 1,000 summaries reach the provider over about three minutes.
const SPREAD_MS_PER_TRACE = 180;
const MAX_SPREAD_MS = 3 * 60_000;
const MAX_FAILED_TICKS = 3;

type SnapshotExecution = TopicExecutionSummary & {
  input: Extract<TopicExecutionSummary["input"], { operation: "update" }>;
};

/** A snapshot still summarizing: an update with summarize settings, before its fit. */
function summarizingSnapshot(
  execution: TopicExecutionSummary | null,
): execution is SnapshotExecution {
  return (
    execution?.input.operation === "update" &&
    !!execution.input.analysis?.summarize &&
    execution.phase === "summarizing" &&
    (execution.status === "queued" || execution.status === "running")
  );
}

/**
 * Advances a snapshot's summarizing by one step: seeds its traces into
 * events-dispatch once, then counts their summaries until enough settled and
 * enqueues the snapshot's fit. Returns whether it is still summarizing.
 */
export async function tickTopicSnapshotSetup(
  projectId: string,
  executionId: string,
  now = new Date(),
): Promise<boolean> {
  const execution = await readTopicExecutionSummary(projectId, executionId);
  if (!summarizingSnapshot(execution)) return false;
  const state = await readTopicSnapshotSummarizing(projectId, executionId);
  try {
    if (!isTopicsProjectEnabled(projectId))
      throw new Error("Topics is not enabled for this project.");
    const seeded = state?.traceIds ? state : await seed(execution, now);
    return await settle(execution, seeded, now);
  } catch (error) {
    const failedTicks = (state?.failedTicks ?? 0) + 1;
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("Topics snapshot summarizing tick failed", {
      projectId,
      executionId,
      failedTicks,
      error,
    });
    // A failure before seeding leaves a state without trace IDs, so the next tick seeds again.
    if (failedTicks < MAX_FAILED_TICKS) {
      await writeTopicSnapshotSummarizing(projectId, executionId, {
        ...(state ?? unseeded(execution, now)),
        failedTicks,
      });
      return true;
    }
    await writeTopicExecution({
      ...execution,
      status: "failed",
      phase: "failed",
      error: message,
    });
    return false;
  }
}

function unseeded(
  execution: SnapshotExecution,
  now: Date,
): TopicSnapshotSummarizing {
  return {
    startedAt: now.toISOString(),
    from: execution.input.timeRange.from.toISOString(),
    traceIds: null,
    seededCount: 0,
    grewAt: null,
    settled: 0,
    failedTicks: 0,
  };
}

/** Selects the traces to summarize and enqueues them as events-dispatch jobs, spread out. */
async function seed(
  execution: SnapshotExecution,
  now: Date,
): Promise<TopicSnapshotSummarizing> {
  const { projectId, id: executionId } = execution;
  const { analysis, timeRange, facets, embeddingConfig } = execution.input;
  const summarize = analysis!.summarize!;
  const days =
    TOPIC_SETUP_WINDOW_DAYS.find(
      (option) =>
        option >=
        Math.round(
          (timeRange.to.getTime() - timeRange.from.getTime()) / DAY_MS,
        ),
    ) ?? TOPIC_SETUP_WINDOW_DAYS[0];
  const matching = analysis!.filter.length
    ? await topicMatchingTraceIdsQuery(
        { projectId, filter: analysis!.filter, ...timeRange },
        prisma,
      )
    : undefined;
  // Twice the idle wait, so a trace's live processing has most likely finished too.
  const traceIds =
    matching === null
      ? []
      : await getTopicSetupTraceIds({
          projectId,
          idleMs: 2 * (await resolveTraceIdleMs(projectId)),
          now: timeRange.to,
          days,
          sampling: 1,
          limit: summarize.limit,
          seed: executionId,
          order: summarize.selection,
          matching,
          summarized: { facets, embeddingConfig },
        });
  const bounds = await getTopicSetupTraceBounds({
    projectId,
    traceIds,
    from: timeRange.from,
  });
  await dispatch(projectId, executionId, bounds, now);
  const state: TopicSnapshotSummarizing = {
    startedAt: now.toISOString(),
    from: new Date(
      Math.min(
        timeRange.from.getTime(),
        ...bounds.map(({ minStart }) => minStart),
      ),
    ).toISOString(),
    traceIds: bounds.map(({ traceId }) => traceId),
    seededCount: bounds.length,
    grewAt: null,
    settled: 0,
    failedTicks: 0,
  };
  await writeTopicSnapshotSummarizing(projectId, executionId, state);
  logger.info("Started Topics snapshot summarizing", {
    projectId,
    executionId,
    days,
    selection: summarize.selection,
    seeded: state.seededCount,
  });
  return state;
}

/**
 * Locality batches as the dispatcher forms them, each job carrying the
 * snapshot's ID instead of rule IDs, delayed so they start over the spread.
 */
async function dispatch(
  projectId: string,
  executionId: string,
  bounds: Awaited<ReturnType<typeof getTopicSetupTraceBounds>>,
  now: Date,
) {
  if (!bounds.length) return;
  const queue = EventsDispatchQueue.getInstance();
  if (!queue) throw new Error("Events dispatch queue is unavailable.");
  const candidates: PendingTrace[] = bounds.map((bound) => ({
    member: traceKey(projectId, bound.traceId),
    due: now.getTime(),
    estimates: { serializedEventBytes: bound.serializedEventBytes },
    trace: {
      projectId,
      traceId: bound.traceId,
      minStart: bound.minStart,
      maxStart: bound.maxStart,
      // A fresh revision stores this transcript under its own key.
      revision: randomUUID(),
      serializedEventBytes: bound.serializedEventBytes,
    },
  }));
  const batches = selectTraceBatches(
    candidates,
    env.LANGFUSE_TRACE_BATCH_MAX_SIZE,
    "locality",
    {
      maxEventUpdates: toLimit(
        env.LANGFUSE_TRACE_BATCH_MAX_BATCH_EVENT_UPDATES,
      ),
      maxSerializedEventBytes: toLimit(
        env.LANGFUSE_TRACE_BATCH_MAX_BATCH_SERIALIZED_BYTES,
      ),
    },
  );
  const spreadMs = Math.min(MAX_SPREAD_MS, bounds.length * SPREAD_MS_PER_TRACE);
  for (const [index, batch] of batches.entries()) {
    const traces = batch.map(({ trace }) => trace);
    const id = createHash("sha256")
      .update(JSON.stringify([executionId, traces]))
      .digest("hex");
    await queue.add(
      QueueJobs.EventsDispatchJob,
      {
        id,
        timestamp: now,
        name: QueueJobs.EventsDispatchJob,
        payload: { traces, batchActionId: executionId },
      },
      {
        jobId: id,
        delay: Math.round((index * spreadMs) / batches.length),
      },
    );
  }
}

/** Counts the seeded traces' summaries; enqueues the fit once enough settled, the count stalled, or the deadline passed. */
async function settle(
  execution: SnapshotExecution,
  state: TopicSnapshotSummarizing,
  now: Date,
): Promise<boolean> {
  const { projectId, id: executionId } = execution;
  const traceIds = state.traceIds ?? [];
  const counts = await countTopicTraceSummaries(
    projectId,
    execution.input.facets,
    execution.input.embeddingConfig,
    traceIds,
    new Date(state.startedAt),
    new Date(state.from),
  );
  const settled = Math.min(...counts.map((count) => count.settled));
  const grewAt = settled > state.settled ? now.toISOString() : state.grewAt;
  const facets = execution.facets.map((facet) => ({
    ...facet,
    counts: {
      ...facet.counts,
      requested: traceIds.length,
      complete:
        counts.find(({ facetId }) => facetId === facet.facetId)?.settled ?? 0,
    },
  }));
  const done =
    settled >= SETTLED_SHARE * traceIds.length ||
    (grewAt !== null && now.getTime() - Date.parse(grewAt) >= STALL_MS) ||
    now.getTime() - Date.parse(state.startedAt) >= DEADLINE_MS;
  await writeTopicSnapshotSummarizing(projectId, executionId, {
    ...state,
    grewAt,
    settled,
    failedTicks: 0,
  });
  await writeTopicExecution({
    ...execution,
    facets,
    status: done ? "queued" : "running",
    phase: done ? "queued" : "summarizing",
    error: null,
  });
  if (!done) return true;
  try {
    await enqueueTopicExecution(projectId, executionId);
  } catch (error) {
    // Back to summarizing, so the next tick retries the handoff.
    await writeTopicExecution({
      ...execution,
      facets,
      status: "running",
      phase: "summarizing",
      error: null,
    });
    throw error;
  }
  // Nothing reads the trace IDs after the handoff; cost uses metadata.executionId.
  await writeTopicSnapshotSummarizing(projectId, executionId, {
    ...state,
    traceIds: [],
    grewAt,
    settled,
    failedTicks: 0,
  });
  logger.info("Finished Topics snapshot summarizing", {
    projectId,
    executionId,
    seeded: state.seededCount,
    settled,
    durationMs: now.getTime() - Date.parse(state.startedAt),
  });
  return false;
}
