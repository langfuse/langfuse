import { type Processor } from "bullmq";
import { randomUUID } from "node:crypto";
import { type Observation } from "@langfuse/shared";
import {
  convertObservation,
  getCurrentSpan,
  getTraceBatchEventStream,
  logger,
  recordDistribution,
  recordGauge,
  recordIncrement,
  TraceBatchEventSchema,
  type QueueName,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";
import {
  ensureDefaultTopicFacets,
  getEnabledTopicsModels,
  isTopicsProjectEnabled,
  pauseTopicsModels,
  type TopicsModels,
} from "@langfuse/shared/topics/server";
import type { TopicFacet } from "@langfuse/shared/topics";
import { env } from "../env";
import { TopicsProviderUnavailable } from "../features/topics/provider-error";
import { summarizeAssembledTrace } from "../features/topics/summarizeAssembledTrace";
import { recordTraceBatchTranscript } from "../features/traceBatching/traceBatchTranscript";

type TraceOutcome =
  | { outcome: "disabled" | "unchanged" | "summarized" }
  | { outcome: "failed"; reason: string };

/**
 * Topics settings of one batch, loaded with one query while the read starts.
 * A project paused mid-batch is skipped for the rest of the batch.
 */
class TopicsBatchProjects {
  private readonly models: Promise<Map<string, TopicsModels>>;
  private readonly facets = new Map<string, Promise<TopicFacet[]>>();
  private readonly paused = new Set<string>();

  constructor(projectIds: Iterable<string>) {
    const allowed = [...new Set(projectIds)].filter(isTopicsProjectEnabled);
    this.models = getEnabledTopicsModels(allowed);
    // A failed load fails each trace that reads it, not the whole batch.
    this.models.catch(() => {});
  }

  async get(projectId: string) {
    if (this.paused.has(projectId)) return null;
    const models = (await this.models).get(projectId);
    if (!models) return null;
    let facets = this.facets.get(projectId);
    if (!facets) {
      facets = ensureDefaultTopicFacets(projectId);
      this.facets.set(projectId, facets);
    }
    return { models, facets: await facets };
  }

  async pause(projectId: string, reason: string) {
    if (this.paused.has(projectId)) return;
    this.paused.add(projectId);
    await pauseTopicsModels(projectId, reason);
  }
}

async function summarizeTraceBatch(
  observations: Observation[],
  topics: TopicsBatchProjects,
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
  const traceTimestamp = new Date(
    Math.min(...observations.map((row) => row.startTime.getTime())),
  ).toISOString();
  let outcome: TraceOutcome = { outcome: "disabled" };
  await recordTraceBatchTranscript(observations, async (transcript) => {
    try {
      const project = await topics.get(first.projectId);
      if (!project) return;
      outcome = {
        outcome: await summarizeAssembledTrace({
          projectId: first.projectId,
          traceId,
          traceTimestamp,
          environment: first.environment,
          traceName: first.name ?? "",
          transcript,
          ...project,
        }),
      };
    } catch (error) {
      // One trace's failure must not fail or re-read the shared batch.
      const reason =
        error instanceof TopicsProviderUnavailable ? error.reason : "other";
      if (
        error instanceof TopicsProviderUnavailable &&
        reason === "authentication"
      )
        await topics.pause(
          first.projectId,
          `${error.message} Topics was turned off; fix the connection and turn it on again.`,
        );
      outcome = { outcome: "failed", reason };
      logger.warn("Topics summary failed for trace", {
        projectId: first.projectId,
        traceId,
        reason,
      });
    }
  });
  return outcome;
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
  for (const [key, count] of counts) {
    const [outcome, reason] = JSON.parse(key) as [string, string | null];
    recordIncrement("langfuse.topics.trace_outcomes", count, {
      outcome,
      ...(reason ? { reason } : {}),
    });
  }
}

const JOB_MAX_AGE_MS = 2 * 60 * 60_000;
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
      if (env.LANGFUSE_TRACE_BATCH_READ_ENABLED !== "true") {
        return "reads_disabled";
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
    const topicsOutcomes: TraceOutcome[] = [];
    const topics = new TopicsBatchProjects(
      batch.traces.map((trace) => trace.projectId),
    );
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
        maxBatchSize: env.LANGFUSE_TRACE_BATCH_MAX_SIZE,
        concurrency: env.LANGFUSE_TRACE_BATCH_CONCURRENCY,
        samplingRate: env.LANGFUSE_TRACE_BATCH_SAMPLING_RATE,
        idleMs: env.LANGFUSE_TRACE_BATCH_IDLE_MS,
        dispatchIntervalMs: env.LANGFUSE_TRACE_BATCH_DISPATCH_INTERVAL_MS,
      });
    }

    // ClickHouse sockets time out when idle, so the reader never waits on
    // transcript or Topics work unless queued payloads exceed the cap.
    // Traces are still summarized one at a time per batch to keep at most
    // one pending request in the tokenizer pool shared with ingestion.
    const pendingSummaries: Promise<void>[] = [];
    let pendingSummaryBytes = 0;
    let summaryFailed = false;
    let summaryError: unknown;
    const enqueueSummary = (observations: Observation[], bytes: number) => {
      pendingSummaryBytes += bytes;
      const enqueuedAt = performance.now();
      const summary = (pendingSummaries.at(-1) ?? Promise.resolve())
        .then(async () => {
          // Let socket reads run between traces' synchronous assembly.
          await new Promise((resolve) => setImmediate(resolve));
          recordDistribution(
            "langfuse.trace_batch.summary_queue_wait_ms",
            performance.now() - enqueuedAt,
          );
          if (!summaryFailed)
            topicsOutcomes.push(
              await summarizeTraceBatch(observations, topics),
            );
        })
        .catch((error: unknown) => {
          if (!summaryFailed) summaryError = error;
          summaryFailed = true;
        })
        .finally(() => {
          pendingSummaryBytes -= bytes;
          pendingSummaries.shift();
        });
      pendingSummaries.push(summary);
    };
    activeReads++;
    try {
      recordTraceBatchActiveReads();
      let traceObservations: Observation[] = [];
      let traceBytes = 0;
      for await (const event of getTraceBatchEventStream(batch, queryOptions)) {
        observationCount++;
        foundTraces.add(JSON.stringify([event.project_id, event.trace_id]));
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
              await pendingSummaries[0];
          }
          if (summaryFailed) break;
        }
        traceBytes += eventBytes;
        traceObservations.push(
          convertObservation({
            ...event,
            id: event.span_id,
            parent_observation_id: event.parent_span_id,
            // These required converter fields are not used by the transcript.
            created_at: event.event_ts,
            updated_at: event.event_ts,
            is_deleted: 0,
            provided_usage_details: {},
            provided_cost_details: {},
            usage_details: {},
            cost_details: {},
          }),
        );
      }
      // Reaching EOF completes the last trace; a failed stream must not flush it.
      if (traceObservations.length && !summaryFailed)
        enqueueSummary(traceObservations, traceBytes);
    } finally {
      try {
        // Drain accepted summaries even when the stream fails.
        await pendingSummaries.at(-1);
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
      batch.traces.length - foundTraces.size,
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
