import { Processor } from "bullmq";
import {
  getObservationsForTraceFromEventsTable,
  QueueName,
  recordDistribution,
  sleep,
  DelayedTraceExecutionEventSchema,
  DelayedTraceExecutionQueue,
  TQueueJobTypes,
} from "@langfuse/shared/src/server";
import {
  isDelayedTraceExecutionEnabled,
  delayedTraceExecutionId,
} from "../features/traces/delayedTraceExecution";
import { env } from "../env";

export const delayedTraceExecutionProcessor: Processor<
  TQueueJobTypes[QueueName.DelayedTraceExecution]
> = async (job) => {
  const { projectId, traceId } = DelayedTraceExecutionEventSchema.parse(
    job.data.payload,
  );
  const id = delayedTraceExecutionId(projectId, traceId);
  if (!isDelayedTraceExecutionEnabled(id)) return;
  const queue = DelayedTraceExecutionQueue.getInstance();
  if (!queue) throw new Error("Trace observation read Redis unavailable");
  const client = await queue.client;
  const minimum = await client.get(queue.toKey(`minimum:${id}`));
  const startedAt = performance.now();
  let outcome = "failure";
  let result;
  try {
    // This is the retained activity window, not a durable trace start. If the
    // cache expired, omit the time bound rather than substitute arrival time.
    result = await getObservationsForTraceFromEventsTable({
      projectId,
      traceId,
      timestamp: minimum === null ? undefined : new Date(Number(minimum)),
      selectIOAndMetadata: true,
      selectToolData: true,
    });
    outcome = "success";
  } finally {
    recordDistribution(
      "langfuse.delayed_trace_execution.observation_lookup_duration_ms",
      performance.now() - startedAt,
      { outcome },
    );
  }
  // Simulate downstream transcript/LLM work without inflating read timing.
  if (env.LANGFUSE_DELAYED_TRACE_EXECUTION_PROCESSING_DELAY_MS > 0) {
    await sleep(env.LANGFUSE_DELAYED_TRACE_EXECUTION_PROCESSING_DELAY_MS);
  }
  // Do not persist observation I/O in the BullMQ result.
  return {
    observationCount: result.observations.length,
    hasMore: result.totalCount > result.observations.length,
  };
};
