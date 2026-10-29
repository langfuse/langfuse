import { type Processor } from "bullmq";
import pLimit from "p-limit";
import { backOff } from "exponential-backoff";
import { randomUUID } from "node:crypto";
import { type Observation } from "@langfuse/shared";
import {
  convertObservation,
  createTraceBatchInputStorage,
  getCurrentSpan,
  getTraceBatchEventStream,
  isInternalEvalEnvironment,
  logger,
  recordDistribution,
  recordGauge,
  recordIncrement,
  TraceBatchEventSchema,
  type QueueName,
  type TQueueJobTypes,
  type TranscriptContext,
  type TraceBatchInputReference,
} from "@langfuse/shared/src/server";
import {
  getEnabledTopicsModels,
  isTopicsProjectEnabled,
  isValidTopicSummary,
  listTopicFacets,
  listTopicRules,
  writeTopicSummaries,
  type TopicsModels,
} from "@langfuse/shared/topics/server";
import type { TopicFacet, TopicSummary } from "@langfuse/shared/topics";
import { env } from "../env";
import {
  getDeterministicSamplingValue,
  shouldSampleEvaluation,
} from "../features/evaluation/deterministicSampling";
import {
  isRejectedConnection,
  pauseForRejectedConnection,
  TopicsProviderUnavailable,
} from "../features/topics/provider-error";
import { TopicMetrics } from "../features/topics/metrics";
import { isRetryableClickhouseInsertError } from "../services/ClickhouseWriter";
import { summarizeAssembledTrace } from "../features/topics/summarizeAssembledTrace";
import { enqueueTopicsAutomation } from "../features/topics/topicsAutomation";
import { recordTraceBatchTranscript } from "../features/traceBatching/traceBatchTranscript";
import { storeInputs } from "../features/traceBatching/storeInputs";

const inputStorage = createTraceBatchInputStorage();

type TraceBatchObservation = Observation & {
  eventTimestamp: string;
  sessionId: string | null;
};

// Rows include a failed trace's valid facets; the batch writes them once.
type TraceOutcome = (
  | { outcome: "disabled" | "unchanged" | "summarized" }
  | { outcome: "failed"; reason: string }
) & { rows: TopicSummary[] };

/** Identity of one trace within a batch; a batch spans projects. */
const traceKey = (projectId: string, traceId: string) =>
  JSON.stringify([projectId, traceId]);

/**
 * Topics settings of one batch, loaded with one query while the read starts.
 * A project paused mid-batch is skipped for the rest of the batch.
 */
class TopicsBatchProjects {
  private readonly models: Promise<Map<string, TopicsModels>>;
  private readonly settings = new Map<
    string,
    Promise<{ facets: TopicFacet[]; sampling: number }>
  >();
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
    let settings = this.settings.get(projectId);
    if (!settings) {
      settings = loadProjectRule(projectId);
      this.settings.set(projectId, settings);
      // A failed load fails this trace only; the next trace loads again.
      settings.catch(() => this.settings.delete(projectId));
    }
    return { models, ...(await settings) };
  }

  async pause(projectId: string, error: TopicsProviderUnavailable) {
    if (this.paused.has(projectId)) return;
    // The project is skipped for this batch even if recording the pause fails.
    this.paused.add(projectId);
    await pauseForRejectedConnection(projectId, error);
  }
}

/** The saved rule's facets and sampling; without a rule, every facet runs. */
async function loadProjectRule(projectId: string) {
  const [facets, rules] = await Promise.all([
    listTopicFacets(projectId),
    listTopicRules(projectId),
  ]);
  const rule = rules[0];
  if (!rule) return { facets, sampling: 1 };
  const selected = new Set(rule.facetIds);
  return {
    facets: facets.filter((facet) => selected.has(facet.id)),
    sampling: rule.sampling,
  };
}

/** Orders events like manual processing: event_ts, then span ID, then environment. */
function newestEvent(observations: TraceBatchObservation[]) {
  return observations.reduce<TraceBatchObservation | undefined>(
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

/** Session of the newest event that has one; events of a trace can carry different or no sessions. */
function newestSessionId(observations: TraceBatchObservation[]) {
  return (
    newestEvent(observations.filter((row) => row.sessionId))?.sessionId ?? null
  );
}

async function summarizeTraceBatch(
  observations: TraceBatchObservation[],
  context: TranscriptContext | null,
  topics: TopicsBatchProjects,
  jobEnqueuedAt: Date,
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
  // Match manual processing and discovery, preserving event_ts microseconds.
  const latest = newestEvent(observations)!;
  if (isInternalEvalEnvironment(latest.environment))
    return { outcome: "disabled", rows: [] };
  const revision = revisions.get(traceKey(first.projectId, traceId));
  const inputReference: TraceBatchInputReference | undefined =
    revision === undefined
      ? undefined
      : { projectId: first.projectId, traceId, revision };
  const traceTimestamp = new Date(
    Math.min(...observations.map((row) => row.startTime.getTime())),
  ).toISOString();
  const sessionId = newestSessionId(observations);
  const traceContext = {
    sessionId,
    traceTimestamp,
    environment: latest.environment,
    traceName: first.name,
  };
  let rows: TopicSummary[] = [];
  try {
    const project = await topics.get(first.projectId);
    if (
      !project ||
      !shouldSampleEvaluation({
        samplingValue: getDeterministicSamplingValue(traceId),
        samplingRate: project.sampling,
      })
    )
      return { outcome: "disabled", rows };
    // Capture reports its own failures; drain both before releasing the Topics slot.
    const [summary] = await Promise.allSettled([
      summarizeAssembledTrace({
        projectId: first.projectId,
        traceId,
        ...traceContext,
        jobEnqueuedAt,
        traceName: traceContext.traceName ?? "",
        transcript: context?.transcript ?? null,
        models: project.models,
        facets: project.facets,
      }),
      inputReference
        ? storeInputs(
            inputReference,
            {
              transcript: context?.transcript ?? null,
              executionIssues: context?.executionIssues ?? [],
              traceContext,
            },
            inputStorage,
          )
        : Promise.resolve(),
    ]);
    if (summary.status === "rejected") throw summary.reason;
    const result = summary.value;
    rows = result.rows;
    if (result.failure === undefined) return { outcome: result.outcome, rows };
    throw result.failure;
  } catch (error) {
    // One trace's failure must not fail or re-read the shared batch.
    const reason =
      error instanceof TopicsProviderUnavailable ? error.reason : "other";
    if (isRejectedConnection(error)) await topics.pause(first.projectId, error);
    logger.warn("Topics summary failed for trace", {
      projectId: first.projectId,
      traceId,
      reason,
      error: error instanceof Error ? error.message : String(error),
    });
    return { outcome: "failed", reason, rows };
  }
}

/**
 * Writes the batch's rows in one insert and returns the rows it dropped. Invalid rows are
 * dropped up front so they cannot fail the others; like ClickhouseWriter, transient errors
 * are retried and any other error drops the insert once.
 */
async function writeBatchSummaries(
  rows: TopicSummary[],
): Promise<TopicSummary[]> {
  const valid = rows.filter(isValidTopicSummary);
  const invalid = rows.filter((row) => !isValidTopicSummary(row));
  if (invalid.length > 0)
    logger.warn("Topics summary rows failed validation", {
      rowCount: invalid.length,
    });
  if (valid.length === 0) return invalid;
  try {
    await new TopicMetrics().measure(
      "storage",
      () =>
        backOff(() => writeTopicSummaries(valid), {
          numOfAttempts: env.LANGFUSE_INGESTION_CLICKHOUSE_MAX_ATTEMPTS,
          retry: isRetryableClickhouseInsertError,
        }),
      "storage",
    );
  } catch (error) {
    logger.warn("Topics summary write failed for trace batch", {
      rowCount: valid.length,
      error: error instanceof Error ? error.message : String(error),
    });
    return rows;
  }
  for (const row of valid)
    recordIncrement("langfuse.topics.facet_summaries", 1, { state: row.state });
  return invalid;
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
    const revisions = new Map(
      batch.traces.map((trace) => [
        traceKey(trace.projectId, trace.traceId),
        trace.revision,
      ]),
    );
    const topicsOutcomes: TraceOutcome[] = [];
    let droppedRows = new Set<TopicSummary>();
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
    // Transcripts are tokenized one trace at a time to keep at most one pending
    // request in the tokenizer pool shared with ingestion; Topics model calls
    // then run for up to LANGFUSE_TOPICS_TRACE_CONCURRENCY traces at once.
    const pendingSummaries = new Set<Promise<void>>();
    const topicsLimit = pLimit(env.LANGFUSE_TOPICS_TRACE_CONCURRENCY);
    let transcribing: Promise<unknown> = Promise.resolve();
    let pendingSummaryBytes = 0;
    let summaryFailed = false;
    let summaryError: unknown;
    const enqueueSummary = (
      observations: TraceBatchObservation[],
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
                await summarizeTraceBatch(
                  observations,
                  assembled.context,
                  topics,
                  event.timestamp,
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
      let traceObservations: TraceBatchObservation[] = [];
      let traceBytes = 0;
      for await (const event of getTraceBatchEventStream(batch, queryOptions)) {
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
        traceObservations.push({
          ...convertObservation({
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
          eventTimestamp: event.event_ts,
          sessionId: event.session_id || null,
        });
      }
      // Reaching EOF completes the last trace; a failed stream must not flush it.
      if (traceObservations.length && !summaryFailed)
        enqueueSummary(traceObservations, traceBytes);
    } finally {
      try {
        // Drain and store accepted summaries even when the stream fails, so a retry skips them.
        await Promise.all(pendingSummaries);
        droppedRows = new Set(
          await writeBatchSummaries(topicsOutcomes.flatMap(({ rows }) => rows)),
        );
      } finally {
        activeReads--;
        recordTraceBatchActiveReads();
      }
      // Stored summaries skip summarization on retry, so queue them before a failure rethrows.
      await enqueueTopicsAutomation(
        event.id,
        topicsOutcomes
          .flatMap(({ rows }) => rows)
          .filter((row) => !droppedRows.has(row)),
      ).catch((error: unknown) =>
        logger.warn("Topics assignment could not be queued for trace batch", {
          error: error instanceof Error ? error.message : String(error),
        }),
      );
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

    recordTopicsOutcomes(
      topicsOutcomes.map((result) =>
        result.outcome === "summarized" &&
        result.rows.some((row) => droppedRows.has(row))
          ? { outcome: "failed", reason: "storage", rows: result.rows }
          : result,
      ),
    );
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
