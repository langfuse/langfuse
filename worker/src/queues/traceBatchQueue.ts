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
import { env } from "../env";
import { recordTraceBatchTranscript } from "../features/traceBatching/traceBatchTranscript";

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
    const queryOptions = {
      maxThreads: env.LANGFUSE_TRACE_BATCH_MAX_THREADS,
      maxBlockSize: env.LANGFUSE_TRACE_BATCH_MAX_BLOCK_SIZE,
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

    activeReads++;
    let pendingTokenization: Promise<void> | undefined;
    try {
      recordTraceBatchActiveReads();
      let traceObservations: Observation[] = [];
      for await (const event of getTraceBatchEventStream(batch, queryOptions)) {
        observationCount++;
        foundTraces.add(JSON.stringify([event.project_id, event.trace_id]));
        foundProjects.add(event.project_id);
        // Logical UTF-8 payload size, excluding JSON transport and compression.
        inputBytes += Buffer.byteLength(event.input);
        outputBytes += Buffer.byteLength(event.output);
        for (const [key, value] of Object.entries(event.metadata)) {
          metadataBytes += Buffer.byteLength(key) + Buffer.byteLength(value);
        }
        const previous = traceObservations[0];
        if (
          previous &&
          (previous.projectId !== event.project_id ||
            previous.traceId !== event.trace_id)
        ) {
          // Overlap tokenization with reading the next trace, but allow only
          // one pending estimate per batch so queued payloads stay bounded.
          await pendingTokenization;
          pendingTokenization = recordTraceBatchTranscript(traceObservations);
          traceObservations = [];
        }
        traceObservations.push(
          convertObservation({
            ...event,
            id: event.span_id,
            parent_observation_id: event.parent_span_id,
            // These required converter fields are not used by the transcript.
            environment: "default",
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
      if (traceObservations.length) {
        await pendingTokenization;
        pendingTokenization = recordTraceBatchTranscript(traceObservations);
      }
    } catch (error) {
      // Only rows consumed before the failure; never count these as successful throughput.
      for (const [name, value] of [
        ["observation_count", observationCount],
        ["input_bytes", inputBytes],
        ["output_bytes", outputBytes],
        ["metadata_bytes", metadataBytes],
        ["io_metadata_bytes", inputBytes + outputBytes + metadataBytes],
      ] as const) {
        recordDistribution(`langfuse.trace_batch.failed_read_${name}`, value);
      }
      throw error;
    } finally {
      try {
        // Drain accepted tokenization promises even when the stream fails.
        await pendingTokenization;
      } finally {
        activeReads--;
        recordTraceBatchActiveReads();
      }
    }

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
      "langfuse.trace_batch.io_metadata_bytes",
      ioMetadataBytes,
    );
    recordDistribution(
      "langfuse.trace_batch.found_project_count",
      foundProjects.size,
    );
    recordDistribution(
      "langfuse.trace_batch.missing_trace_count",
      batch.traces.length - foundTraces.size,
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
    recordIncrement("langfuse.trace_batch.read_attempts", 1, { outcome });
    recordDistribution("langfuse.trace_batch.read_duration_ms", durationMs, {
      outcome,
    });
  }
};
