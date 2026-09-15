import { type Processor } from "bullmq";
import {
  getTraceBatchEventStream,
  logger,
  recordDistribution,
  recordIncrement,
  TraceBatchEventSchema,
  type QueueName,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";
import { env } from "../env";

const JOB_MAX_AGE_MS = 2 * 60 * 60_000;

export const traceBatchQueueProcessor: Processor<
  TQueueJobTypes[QueueName.TraceBatch]
> = async (job) => {
  if (env.LANGFUSE_TRACE_BATCH_READ_ENABLED !== "true") {
    // BullMQ reads these options after the processor returns, then removes atomically.
    job.opts.removeOnComplete = true;
    recordIncrement("langfuse.trace_batch.discarded_jobs", 1, {
      reason: "reads_disabled",
    });
    return { discarded: "reads_disabled" };
  }
  const event = TraceBatchEventSchema.parse(job.data);
  if (Date.now() - event.timestamp.getTime() >= JOB_MAX_AGE_MS) {
    job.opts.removeOnComplete = true;
    recordIncrement("langfuse.trace_batch.discarded_jobs", 1, {
      reason: "expired",
    });
    return { discarded: "expired" };
  }
  const batch = event.payload;
  const foundTraces = new Set<string>();
  const foundProjects = new Set<string>();
  let observationCount = 0;
  let ioMetadataBytes = 0;

  const queryOptions = {
    maxThreads: env.LANGFUSE_TRACE_BATCH_MAX_THREADS,
    maxBlockSize: env.LANGFUSE_TRACE_BATCH_MAX_BLOCK_SIZE,
    experimentId: env.LANGFUSE_TRACE_BATCH_EXPERIMENT_ID,
  };
  if (queryOptions.experimentId) {
    logger.info("Trace batch experiment read", {
      ...queryOptions,
      // null means no override; the server profile's value is not known here.
      maxBlockSize: queryOptions.maxBlockSize ?? null,
      buildId: env.BUILD_ID,
      batchTraceCount: batch.traces.length,
      maxBatchSize: env.LANGFUSE_TRACE_BATCH_MAX_SIZE,
      concurrency: env.LANGFUSE_TRACE_BATCH_CONCURRENCY,
      strategy: env.LANGFUSE_TRACE_BATCH_STRATEGY,
      samplingRate: env.LANGFUSE_TRACE_BATCH_SAMPLING_RATE,
      idleMs: env.LANGFUSE_TRACE_BATCH_IDLE_MS,
      dispatchIntervalMs: env.LANGFUSE_TRACE_BATCH_DISPATCH_INTERVAL_MS,
    });
  }

  for await (const event of getTraceBatchEventStream(batch, queryOptions)) {
    observationCount++;
    foundTraces.add(JSON.stringify([event.project_id, event.trace_id]));
    foundProjects.add(event.project_id);
    // Logical UTF-8 payload size, excluding JSON transport and compression.
    ioMetadataBytes +=
      Buffer.byteLength(event.input) + Buffer.byteLength(event.output);
    for (const [key, value] of Object.entries(event.metadata)) {
      ioMetadataBytes += Buffer.byteLength(key) + Buffer.byteLength(value);
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
  recordDistribution("langfuse.trace_batch.io_metadata_bytes", ioMetadataBytes);
  recordDistribution(
    "langfuse.trace_batch.found_project_count",
    foundProjects.size,
  );
  recordDistribution(
    "langfuse.trace_batch.missing_trace_count",
    batch.traces.length - foundTraces.size,
  );

  // Retries can repeat this read; observation payloads never enter job results.
  return {
    observationCount,
    traceCount: foundTraces.size,
    projectCount: foundProjects.size,
    ioMetadataBytes,
  };
};
