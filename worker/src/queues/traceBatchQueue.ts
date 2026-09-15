import { type Processor } from "bullmq";
import {
  getTraceBatchEventStream,
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
  const disabledReason = !env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION
    ? "not_cloud"
    : env.LANGFUSE_TRACE_BATCH_READ_ENABLED !== "true"
      ? "reads_disabled"
      : undefined;
  if (disabledReason) {
    // BullMQ reads these options after the processor returns, then removes atomically.
    job.opts.removeOnComplete = true;
    recordIncrement("langfuse.trace_batch.discarded_jobs", 1, {
      reason: disabledReason,
    });
    return { discarded: disabledReason };
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
  let inputBytes = 0;
  let outputBytes = 0;
  let metadataBytes = 0;

  for await (const event of getTraceBatchEventStream(batch)) {
    observationCount++;
    foundTraces.add(JSON.stringify([event.project_id, event.trace_id]));
    foundProjects.add(event.project_id);
    // Logical UTF-8 payload size, excluding JSON transport and compression.
    inputBytes += Buffer.byteLength(event.input);
    outputBytes += Buffer.byteLength(event.output);
    for (const [key, value] of Object.entries(event.metadata)) {
      metadataBytes += Buffer.byteLength(key) + Buffer.byteLength(value);
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
    inputBytes,
    outputBytes,
    metadataBytes,
    ioMetadataBytes,
  };
};
