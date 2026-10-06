import { type Processor } from "bullmq";
import { randomUUID } from "node:crypto";
import { type Observation } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  topicProcessingConfigSchema,
  topicEmbeddingConfigSchema,
} from "@langfuse/shared/topics";
import {
  enqueueAutomaticTopicAssignments,
  isTopicsProjectEnabled,
  ensureDefaultTopicFacets,
  getTopicsModelConfig,
} from "@langfuse/shared/topics/server";
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
import { env } from "../env";
import { TopicsProviderUnavailable } from "../features/topics/provider-error";
import {
  summarizeAssembledTrace,
  type TopicProcessingScope,
} from "../features/topics/summarizeAssembledTrace";
import { enqueueFailedTopicTrace } from "../features/topics/enqueueFailedTopicTrace";
import { recordTraceBatchTranscript } from "../features/traceBatching/traceBatchTranscript";

type TraceOutcome =
  | { outcome: "disabled" | "unchanged" | "summarized" }
  | { outcome: "failed"; reason: string };

async function summarizeTraceBatch(
  observations: Observation[],
  recover: (
    input: Parameters<typeof enqueueFailedTopicTrace>[0],
  ) => Promise<void>,
  topicProjects: ReadonlyMap<string, TopicProcessingScope>,
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
    const scope = topicProjects.get(first.projectId);
    if (!scope) return;
    try {
      outcome = {
        outcome: await summarizeAssembledTrace({
          projectId: first.projectId,
          traceId,
          traceTimestamp,
          environment: first.environment,
          traceName: first.name ?? "",
          transcript,
          scope,
        }),
      };
    } catch (error) {
      await recover({
        projectId: first.projectId,
        traceId,
        traceTimestamp,
      });
      const reason =
        error instanceof TopicsProviderUnavailable ? error.reason : "other";
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

/** Failures are counted here; their retained Topics executions own recovery. */
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
      if (job.data.topicRecovery || job.data.topicAssignment)
        throw new Error(
          "Trace-batch processing is disabled with a pending Topics admission.",
        );
      outcome = "discard";
      // BullMQ reads these options after the processor returns, then removes atomically.
      job.opts.removeOnComplete = true;
      recordIncrement("langfuse.trace_batch.discarded_jobs", 1, {
        reason: disabledReason,
      });
      return { discarded: disabledReason };
    }
    const event = TraceBatchEventSchema.parse(job.data);
    let assignment = event.topicAssignment;
    const topicProjects = new Map(
      assignment?.projects.map((scope) => [scope.projectId, scope]),
    );
    if (
      assignment &&
      (topicProjects.size !== assignment.projects.length ||
        assignment.projects.some(
          ({ projectId }) =>
            !event.payload.traces.some(
              (trace) => trace.projectId === projectId,
            ),
        ))
    )
      throw new Error(
        "Topics assignment scope does not belong to its trace batch.",
      );
    const admitRecovery = async (
      reference: NonNullable<typeof event.topicRecovery>,
    ) => {
      if (
        !event.payload.traces.some(
          (trace) =>
            trace.projectId === reference.projectId &&
            trace.traceId === reference.traceId,
        )
      )
        throw new Error(
          "Topics recovery source does not belong to its trace batch.",
        );
      await enqueueFailedTopicTrace(
        reference,
        async (accepted) => {
          await job.updateData({ ...job.data, topicRecovery: accepted });
        },
        topicProjects.get(reference.projectId),
      );
      await job.updateData({ ...job.data, topicRecovery: undefined });
    };
    const recover = async (
      reference: NonNullable<typeof event.topicRecovery>,
    ) => {
      await job.updateData({ ...job.data, topicRecovery: reference });
      await admitRecovery(reference);
    };
    const admitAssignments = async (
      assignment: NonNullable<typeof event.topicAssignment>,
    ) => {
      const projectIds = new Set(
        assignment.projects.map(({ projectId }) => projectId),
      );
      const tracesByProject = new Map<string, string[]>();
      for (const { projectId, traceId } of event.payload.traces) {
        if (!projectIds.has(projectId)) continue;
        const traceIds = tracesByProject.get(projectId) ?? [];
        traceIds.push(traceId);
        tracesByProject.set(projectId, traceIds);
      }
      if (tracesByProject.size !== projectIds.size)
        throw new Error(
          "Topics assignment scope does not belong to its trace batch.",
        );
      for (const [projectId, traceIds] of tracesByProject) {
        const scope = topicProjects.get(projectId)!;
        await enqueueAutomaticTopicAssignments({
          projectId,
          traceIds,
          batchId: event.id,
          timeRange: assignment.timeRange,
          facets: scope.facets,
          embeddingConfig: scope.embeddingConfig,
        });
      }
    };
    // Finish retained admissions even when the original batch's read window expired.
    if (event.topicRecovery) await admitRecovery(event.topicRecovery);
    if (Date.now() - event.timestamp.getTime() >= JOB_MAX_AGE_MS) {
      if (event.topicAssignment) await admitAssignments(event.topicAssignment);
      outcome = "discard";
      job.opts.removeOnComplete = true;
      recordIncrement("langfuse.trace_batch.discarded_jobs", 1, {
        reason: "expired",
      });
      return { discarded: "expired" };
    }
    const batch = event.payload;
    const eligibleProjects = [
      ...new Set(
        batch.traces
          .map(({ projectId }) => projectId)
          .filter(isTopicsProjectEnabled),
      ),
    ];
    if (!assignment && eligibleProjects.length) {
      const to = new Date();
      const models = getTopicsModelConfig();
      const processingConfig = topicProcessingConfigSchema.parse({
        summaryModel: models.summaryModel,
      });
      const embeddingConfig = topicEmbeddingConfigSchema.parse({
        embeddingModel: models.embeddingModel,
      });
      for (const projectId of eligibleProjects) {
        const projectFacets = await ensureDefaultTopicFacets(projectId).catch(
          async (error) => {
            if (
              await prisma.project.findUnique({
                where: { id: projectId },
                select: { id: true },
              })
            )
              throw error;
            return null;
          },
        );
        if (!projectFacets) continue;
        const facets = projectFacets.flatMap((facet) =>
          facet.projectId === projectId
            ? facet.versions
                .slice(0, 1)
                .map(({ facetId, version }) => ({ facetId, version }))
            : [],
        );
        topicProjects.set(projectId, {
          projectId,
          facets,
          processingConfig,
          embeddingConfig,
        });
      }
      if (topicProjects.size) {
        assignment = {
          projects: [...topicProjects.values()],
          timeRange: {
            from: new Date(to.getTime() - 7 * 86400000),
            to,
          },
        };
        // Retain accepted scope until BullMQ removes the job, including stalled replays.
        await job.updateData({
          ...job.data,
          topicAssignment: assignment,
        });
      }
    }
    const topicsOutcomes: TraceOutcome[] = [];
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
              await summarizeTraceBatch(observations, recover, topicProjects),
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
    if (assignment) await admitAssignments(assignment);
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
