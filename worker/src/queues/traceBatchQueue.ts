import { type Processor } from "bullmq";
import {
  getTraceBatchEventStream,
  recordDistribution,
  TraceBatchEventSchema,
  type QueueName,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";

export const traceBatchQueueProcessor: Processor<
  TQueueJobTypes[QueueName.TraceBatch]
> = async (job) => {
  const batch = TraceBatchEventSchema.parse(job.data).payload;
  const foundTraces = new Set<string>();
  let observationCount = 0;
  let ioMetadataBytes = 0;

  for await (const event of getTraceBatchEventStream(batch)) {
    observationCount++;
    foundTraces.add(JSON.stringify([event.project_id, event.trace_id]));
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
    "langfuse.trace_batch.missing_trace_count",
    batch.traces.length - foundTraces.size,
  );

  // Retries can repeat this read; observation payloads never enter job results.
  return {
    observationCount,
    traceCount: foundTraces.size,
    ioMetadataBytes,
  };
};
