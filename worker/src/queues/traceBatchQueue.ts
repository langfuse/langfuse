import { type Processor } from "bullmq";
import pLimit from "p-limit";
import { randomUUID } from "node:crypto";
import {
  createTraceBatchInputStorage,
  getCurrentSpan,
  getTraceBatchEventStream,
  isInternalEvalEnvironment,
  logger,
  QueueJobs,
  recordDistribution,
  recordGauge,
  recordIncrement,
  TraceBatchEventSchema,
  TopicsTraceQueue,
  traceException,
  instrumentAsync,
  type QueueName,
  type TopicsTraceEventType,
  type TQueueJobTypes,
  type TraceBatchInputReference,
  type TranscriptContext,
} from "@langfuse/shared/src/server";
import {
  getEnabledTopicsModels,
  isTopicsProjectEnabled,
  listTopicRules,
} from "@langfuse/shared/topics/server";
import { env } from "../env";
import {
  getDeterministicSamplingValue,
  shouldSampleEvaluation,
} from "../features/evaluation/deterministicSampling";
import {
  newestEvent,
  newestSessionId,
  toTraceEventObservation,
  traceKey,
  type TraceEventObservation,
} from "../features/eventsDispatch/traceEvents";
import { recordTraceBatchTranscript } from "../features/traceBatching/traceBatchTranscript";
import {
  isTraceBatchPipelineEnabled,
  isTraceBatchSampled,
  isTraceDispatchEnabled,
} from "../features/traceBatching/traceBatchSampling";

const inputStorage = createTraceBatchInputStorage();
const JOB_MAX_AGE_MS = 2 * 60 * 60_000;

type TraceOutcome =
  | { outcome: "disabled" | "queued" }
  | { outcome: "failed"; reason: string };

type TopicsTraceRule = { ruleId: string; sampling: number };

/**
 * Topics rules of one batch's projects, loaded once per project. Projects
 * without enabled models, e.g. paused ones, are skipped.
 */
class TopicsBatchProjects {
  private readonly models: Promise<Set<string>>;
  private readonly rules = new Map<string, Promise<TopicsTraceRule[]>>();

  constructor(projectIds: Iterable<string>) {
    const allowed = [...new Set(projectIds)].filter(isTopicsProjectEnabled);
    this.models = getEnabledTopicsModels(allowed).then(
      (models) => new Set(models.keys()),
    );
    // A failed load fails each trace that reads it, not the whole batch.
    this.models.catch(() => {});
  }

  async get(projectId: string): Promise<TopicsTraceRule[]> {
    if (!(await this.models).has(projectId)) return [];
    let rules = this.rules.get(projectId);
    if (!rules) {
      rules = loadProjectRules(projectId);
      this.rules.set(projectId, rules);
      // A failed load fails this trace only; the next trace loads again.
      rules.catch(() => this.rules.delete(projectId));
    }
    return rules;
  }
}

/** Rules with at least one facet; the per-trace job resolves the facets at their current version. */
async function loadProjectRules(projectId: string): Promise<TopicsTraceRule[]> {
  return (await listTopicRules(projectId)).flatMap((rule) =>
    rule.facetIds.length > 0
      ? [{ ruleId: rule.id, sampling: rule.sampling }]
      : [],
  );
}

/** Uploads one trace's inputs under its revision; the span records size and outcome. */
async function storeTraceInputs(
  reference: TraceBatchInputReference,
  observations: TraceEventObservation[],
  context: TranscriptContext | null,
): Promise<"stored" | "too_large"> {
  return instrumentAsync({ name: "trace-batch-store-inputs" }, async (span) => {
    span.setAttributes({
      "langfuse.project.id": reference.projectId,
      "langfuse.trace.id": reference.traceId,
      "langfuse.trace_batch.revision": reference.revision,
    });
    try {
      const result = await inputStorage.put(reference, {
        transcript: context?.transcript ?? null,
        executionIssues: context?.executionIssues ?? [],
        traceContext: {
          sessionId: newestSessionId(observations),
          traceTimestamp: new Date(
            Math.min(...observations.map((row) => row.startTime.getTime())),
          ).toISOString(),
          environment: newestEvent(observations)!.environment,
          traceName: observations[0].name,
        },
      });
      span.setAttributes({
        "langfuse.trace_batch.input_storage.outcome": result.outcome,
        "langfuse.trace_batch.input_storage.json_characters": result.jsonLength,
      });
      return result.outcome;
    } catch (error) {
      span.setAttribute(
        "langfuse.trace_batch.input_storage.outcome",
        "upload_failed",
      );
      traceException(error, span);
      throw error;
    }
  });
}

/** One job per trace revision; a batch retry within its own lifetime never enqueues it twice. */
async function enqueueTopicsTraceJob(
  reference: TraceBatchInputReference,
  rules: TopicsTraceRule[],
): Promise<void> {
  const queue = TopicsTraceQueue.getInstance({
    shardingKey: `${reference.projectId}-${reference.traceId}`,
  });
  if (!queue) throw new Error("Topics trace queue is unavailable.");
  const payload: TopicsTraceEventType = {
    ...reference,
    ruleIds: rules.map((rule) => rule.ruleId),
  };
  await queue.add(
    QueueJobs.TopicsTraceJob,
    {
      name: QueueJobs.TopicsTraceJob,
      id: randomUUID(),
      timestamp: new Date(),
      payload,
    },
    {
      deduplication: {
        id: JSON.stringify([
          reference.projectId,
          reference.traceId,
          reference.revision,
        ]),
        ttl: JOB_MAX_AGE_MS,
      },
    },
  );
}

/**
 * Stores one sampled trace's transcript and enqueues its per-trace Topics job
 * with every rule that samples it. Never throws, so one trace cannot fail the batch.
 */
async function enqueueTraceTopics(
  observations: TraceEventObservation[],
  context: TranscriptContext | null,
  topics: TopicsBatchProjects,
  revisions: ReadonlyMap<string, string>,
): Promise<TraceOutcome> {
  const first = observations[0];
  const traceId = first?.traceId;
  if (
    !first ||
    !traceId ||
    observations.some(
      (row) => row.projectId !== first.projectId || row.traceId !== traceId,
    )
  )
    throw new Error(
      "Trace batch observations crossed a project or trace boundary.",
    );
  const projectId = first.projectId;
  // Match manual processing and discovery, preserving event_ts microseconds.
  if (isInternalEvalEnvironment(newestEvent(observations)!.environment))
    return { outcome: "disabled" };
  const revision = revisions.get(traceKey(projectId, traceId));
  if (revision === undefined) return { outcome: "failed", reason: "revision" };
  const reference = { projectId, traceId, revision };
  let reason = "rules";
  try {
    const samplingValue = getDeterministicSamplingValue(traceId);
    const rules = (await topics.get(projectId)).filter((rule) =>
      shouldSampleEvaluation({ samplingValue, samplingRate: rule.sampling }),
    );
    if (rules.length === 0) return { outcome: "disabled" };
    reason = "input_storage";
    const stored = await storeTraceInputs(reference, observations, context);
    if (stored === "too_large")
      return { outcome: "failed", reason: "input_too_large" };
    reason = "enqueue";
    await enqueueTopicsTraceJob(reference, rules);
    return { outcome: "queued" };
  } catch (error) {
    logger.warn("Topics trace could not be queued", {
      projectId,
      traceId,
      reason,
      error: error instanceof Error ? error.message : String(error),
    });
    return { outcome: "failed", reason };
  }
}

/** Failed traces are counted, not retried. */
function recordTopicsOutcomes(outcomes: TraceOutcome[]): void {
  const counts = new Map<string, number>();
  for (const result of outcomes) {
    const key = JSON.stringify([
      result.outcome,
      result.outcome === "failed" ? result.reason : undefined,
    ]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const perOutcome: Record<string, number> = {};
  for (const [key, count] of counts) {
    const [outcome, reason] = JSON.parse(key) as [string, string | null];
    recordIncrement("langfuse.topics.trace_outcomes", count, {
      source: "trace_batch",
      outcome,
      ...(reason ? { reason } : {}),
    });
    if (outcome === "disabled") continue;
    const attribute = `langfuse.topics.traces.${outcome}`;
    perOutcome[attribute] = (perOutcome[attribute] ?? 0) + count;
  }
  // Batch totals of Topics work on the job span; each trace has its own child span.
  if (Object.keys(perOutcome).length > 0)
    getCurrentSpan()?.setAttributes(perOutcome);
}

let activeReads = 0;

export function recordTraceBatchActiveReads(): void {
  recordGauge("langfuse.trace_batch.active_reads", activeReads);
}

export const traceBatchQueueProcessor: Processor<
  TQueueJobTypes[QueueName.TraceBatch]
> = async (job) => {
  const startedAt = performance.now();
  // Keep attributes on the processing span rather than a nested read span.
  const span = env.LANGFUSE_TRACE_BATCH_EXPERIMENT_ID
    ? getCurrentSpan()
    : undefined;
  let outcome: "success" | "failure" | "discard" = "failure";
  let queryId: string | undefined;
  let batchShape:
    | {
        batchTraceCount: number;
        batchProjectCount: number;
        eventTimeSpanMs: number;
        maxTraceSpanMs: number;
      }
    | undefined;
  const foundTraces = new Set<string>();
  const foundProjects = new Set<string>();
  let observationCount = 0;
  let inputBytes = 0;
  let outputBytes = 0;
  let metadataBytes = 0;
  try {
    span?.setAttributes({
      "langfuse.trace_batch.experiment_id":
        env.LANGFUSE_TRACE_BATCH_EXPERIMENT_ID,
      "langfuse.trace_batch.job_id": job.id,
      "langfuse.trace_batch.attempt": job.attemptsMade + 1,
    });
    const disabledReason = (() => {
      if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
        return "not_cloud";
      }
      if (!isTraceBatchPipelineEnabled()) {
        return "pipelines_disabled";
      }
      return undefined;
    })();
    if (disabledReason) {
      outcome = "discard";
      // BullMQ reads these options after the processor returns, then removes atomically.
      job.opts.removeOnComplete = true;
      recordIncrement("langfuse.trace_batch.discarded_jobs", 1, {
        reason: disabledReason,
      });
      return { discarded: disabledReason };
    }
    const event = TraceBatchEventSchema.parse(job.data);
    if (Date.now() - event.timestamp.getTime() >= JOB_MAX_AGE_MS) {
      outcome = "discard";
      job.opts.removeOnComplete = true;
      recordIncrement("langfuse.trace_batch.discarded_jobs", 1, {
        reason: "expired",
      });
      return { discarded: "expired" };
    }
    const batch = event.payload;
    const revisions = new Map(
      batch.traces.map((trace) => [
        traceKey(trace.projectId, trace.traceId),
        trace.revision,
      ]),
    );
    const topicsOutcomes: TraceOutcome[] = [];
    const topics = new TopicsBatchProjects(
      batch.traces.map((trace) => trace.projectId),
    );
    // Read ClickHouse only for traces at least one Topics rule samples.
    // Every other trace ends at the dispatcher.
    const readable: typeof batch.traces = [];
    const skipped = { no_topics_project: 0, rule_sampling: 0 };
    for (const trace of batch.traces) {
      // A failed rule load is reported per trace when it is queued.
      const rules = await topics.get(trace.projectId).catch(() => undefined);
      if (rules?.length === 0) skipped.no_topics_project++;
      else if (
        rules &&
        !rules.some((rule) => isTraceBatchSampled(trace.traceId, rule.sampling))
      )
        skipped.rule_sampling++;
      else readable.push(trace);
    }
    for (const [reason, count] of Object.entries(skipped))
      if (count > 0)
        recordIncrement("langfuse.trace_batch.skipped_traces", count, {
          reason,
        });
    if (readable.length === 0) {
      outcome = "success";
      return {
        observationCount: 0,
        traceCount: 0,
        projectCount: 0,
        inputBytes: 0,
        outputBytes: 0,
        metadataBytes: 0,
        ioMetadataBytes: 0,
      };
    }
    const queryOptions = {
      maxThreads: env.LANGFUSE_TRACE_BATCH_MAX_THREADS,
      maxBlockSize: env.LANGFUSE_TRACE_BATCH_MAX_BLOCK_SIZE,
      requestTimeoutMs: env.LANGFUSE_TRACE_BATCH_REQUEST_TIMEOUT_MS,
      experimentId: env.LANGFUSE_TRACE_BATCH_EXPERIMENT_ID,
      queryId: randomUUID(),
    };
    queryId = queryOptions.queryId;
    if (queryOptions.experimentId) {
      const projects = new Set<string>();
      let minStart = Infinity;
      let maxStart = -Infinity;
      let maxTraceSpanMs = 0;
      for (const trace of batch.traces) {
        projects.add(trace.projectId);
        minStart = Math.min(minStart, trace.minStart);
        maxStart = Math.max(maxStart, trace.maxStart);
        maxTraceSpanMs = Math.max(
          maxTraceSpanMs,
          trace.maxStart - trace.minStart,
        );
      }
      batchShape = {
        batchTraceCount: batch.traces.length,
        batchProjectCount: projects.size,
        eventTimeSpanMs: batch.traces.length ? maxStart - minStart : 0,
        maxTraceSpanMs,
      };
      span?.setAttributes({
        "langfuse.trace_batch.query_id": queryId,
        "langfuse.trace_batch.batch_trace_count": batchShape.batchTraceCount,
        "langfuse.trace_batch.batch_project_count":
          batchShape.batchProjectCount,
        "langfuse.trace_batch.event_time_span_ms": batchShape.eventTimeSpanMs,
        "langfuse.trace_batch.max_trace_span_ms": batchShape.maxTraceSpanMs,
      });
      logger.info("Trace batch experiment read", {
        ...queryOptions,
        jobId: job.id,
        attempt: job.attemptsMade + 1,
        // null means no override; the server profile's value is not known here.
        maxBlockSize: queryOptions.maxBlockSize ?? null,
        buildId: env.BUILD_ID,
        batchTraceCount: batch.traces.length,
        readableTraceCount: readable.length,
        maxBatchSize: env.LANGFUSE_TRACE_BATCH_MAX_SIZE,
        concurrency: env.LANGFUSE_TRACE_BATCH_CONCURRENCY,
        // Legacy Topics tracking admits every trace of an active project.
        samplingRate: isTraceDispatchEnabled()
          ? env.LANGFUSE_TRACE_DISPATCH_SAMPLING_RATE
          : 1,
        idleMs: env.LANGFUSE_TRACE_BATCH_IDLE_MS,
        dispatchIntervalMs: env.LANGFUSE_TRACE_BATCH_DISPATCH_INTERVAL_MS,
      });
    }

    // ClickHouse sockets time out when idle, so the reader never waits on
    // transcript or Topics work unless queued payloads exceed the cap.
    // Assemble one transcript at a time, then upload transcripts and enqueue
    // Topics jobs for up to LANGFUSE_TOPICS_TRACE_CONCURRENCY traces at once.
    const pendingSummaries = new Set<Promise<void>>();
    const topicsLimit = pLimit(env.LANGFUSE_TOPICS_TRACE_CONCURRENCY);
    let transcribing: Promise<unknown> = Promise.resolve();
    let pendingSummaryBytes = 0;
    let summaryFailed = false;
    let summaryError: unknown;
    const enqueueSummary = (
      observations: TraceEventObservation[],
      bytes: number,
    ) => {
      pendingSummaryBytes += bytes;
      const enqueuedAt = performance.now();
      const transcribed = transcribing.then(async () => {
        // Let socket reads run between traces' synchronous assembly.
        await new Promise((resolve) => setImmediate(resolve));
        recordDistribution(
          "langfuse.trace_batch.summary_queue_wait_ms",
          performance.now() - enqueuedAt,
        );
        if (summaryFailed) return null;
        let context: TranscriptContext | null = null;
        await recordTraceBatchTranscript(observations, async (assembled) => {
          context = assembled;
        });
        return { context };
      });
      transcribing = transcribed.catch(() => {});
      const summary: Promise<void> = transcribed
        .then(async (assembled) => {
          if (!assembled) return;
          await topicsLimit(async () => {
            if (!summaryFailed)
              topicsOutcomes.push(
                await enqueueTraceTopics(
                  observations,
                  assembled.context,
                  topics,
                  revisions,
                ),
              );
          });
        })
        .catch((error: unknown) => {
          if (!summaryFailed) summaryError = error;
          summaryFailed = true;
        })
        .finally(() => {
          pendingSummaryBytes -= bytes;
          pendingSummaries.delete(summary);
        });
      pendingSummaries.add(summary);
    };
    activeReads++;
    try {
      recordTraceBatchActiveReads();
      let traceObservations: TraceEventObservation[] = [];
      let traceBytes = 0;
      for await (const event of getTraceBatchEventStream(
        { ...batch, traces: readable },
        queryOptions,
      )) {
        observationCount++;
        foundTraces.add(traceKey(event.project_id, event.trace_id));
        foundProjects.add(event.project_id);
        // Logical UTF-8 payload size, excluding JSON transport and compression.
        const eventInputBytes = Buffer.byteLength(event.input);
        const eventOutputBytes = Buffer.byteLength(event.output);
        let eventBytes = eventInputBytes + eventOutputBytes;
        inputBytes += eventInputBytes;
        outputBytes += eventOutputBytes;
        for (const [key, value] of Object.entries(event.metadata)) {
          const bytes = Buffer.byteLength(key) + Buffer.byteLength(value);
          metadataBytes += bytes;
          eventBytes += bytes;
        }
        const previous = traceObservations[0];
        if (
          previous &&
          (previous.projectId !== event.project_id ||
            previous.traceId !== event.trace_id)
        ) {
          if (summaryFailed) break;
          enqueueSummary(traceObservations, traceBytes);
          traceObservations = [];
          traceBytes = 0;
          if (
            pendingSummaryBytes >
            env.LANGFUSE_TRACE_BATCH_MAX_PENDING_SUMMARY_BYTES
          ) {
            recordIncrement("langfuse.trace_batch.summary_backpressure", 1);
            // Resume as soon as completed work brings the queue below the cap.
            while (
              pendingSummaryBytes >
              env.LANGFUSE_TRACE_BATCH_MAX_PENDING_SUMMARY_BYTES
            )
              await Promise.race(pendingSummaries);
          }
          if (summaryFailed) break;
        }
        traceBytes += eventBytes;
        traceObservations.push(toTraceEventObservation(event));
      }
      // Reaching EOF completes the last trace; a failed stream must not flush it.
      if (traceObservations.length && !summaryFailed)
        enqueueSummary(traceObservations, traceBytes);
    } finally {
      try {
        // Drain enqueues even when the stream fails; deduplication makes a retry skip them.
        await Promise.all(pendingSummaries);
      } finally {
        activeReads--;
        recordTraceBatchActiveReads();
      }
    }
    if (summaryFailed) throw summaryError;

    recordDistribution(
      "langfuse.trace_batch.observation_count",
      observationCount,
    );
    recordDistribution(
      "langfuse.trace_batch.found_trace_count",
      foundTraces.size,
    );
    const ioMetadataBytes = inputBytes + outputBytes + metadataBytes;
    recordDistribution("langfuse.trace_batch.input_bytes", inputBytes);
    recordDistribution("langfuse.trace_batch.output_bytes", outputBytes);
    recordDistribution("langfuse.trace_batch.metadata_bytes", metadataBytes);
    recordDistribution(
      "langfuse.trace_batch.missing_trace_count",
      readable.length - foundTraces.size,
    );

    recordTopicsOutcomes(topicsOutcomes);
    // Retries can repeat this read; observation payloads never enter job results.
    outcome = "success";
    return {
      observationCount,
      traceCount: foundTraces.size,
      projectCount: foundProjects.size,
      inputBytes,
      outputBytes,
      metadataBytes,
      ioMetadataBytes,
    };
  } finally {
    if (queryId && outcome === "failure") {
      // Consumed rows from failed attempts are not successful throughput.
      for (const [name, value] of [
        ["observation_count", observationCount],
        ["input_bytes", inputBytes],
      ] as const) {
        recordDistribution(`langfuse.trace_batch.failed_read_${name}`, value);
      }
    }
    const durationMs = performance.now() - startedAt;
    span?.setAttributes({
      "langfuse.trace_batch.outcome": outcome,
      "langfuse.trace_batch.duration_ms": durationMs,
      ...(queryId
        ? {
            "langfuse.trace_batch.observation_count": observationCount,
            "langfuse.trace_batch.found_trace_count": foundTraces.size,
            "langfuse.trace_batch.found_project_count": foundProjects.size,
            "langfuse.trace_batch.input_bytes": inputBytes,
            "langfuse.trace_batch.output_bytes": outputBytes,
            "langfuse.trace_batch.metadata_bytes": metadataBytes,
            "langfuse.trace_batch.partial": outcome !== "success",
          }
        : {}),
    });
    if (env.LANGFUSE_TRACE_BATCH_EXPERIMENT_ID) {
      logger.info("Trace batch experiment read completed", {
        experimentId: env.LANGFUSE_TRACE_BATCH_EXPERIMENT_ID,
        jobId: job.id,
        attempt: job.attemptsMade + 1,
        queryId,
        outcome,
        durationMs,
        ...batchShape,
        ...(queryId
          ? {
              observationCount,
              foundTraceCount: foundTraces.size,
              foundProjectCount: foundProjects.size,
              inputBytes,
              outputBytes,
              metadataBytes,
              partial: outcome !== "success",
            }
          : {}),
      });
    }
  }
};
