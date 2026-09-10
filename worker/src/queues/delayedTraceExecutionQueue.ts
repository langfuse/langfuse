import { Processor } from "bullmq";
import {
  getObservationsForTraceFromEventsTable,
  QueueName,
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
  const { projectId, traceId, lastSeenStartTime } =
    DelayedTraceExecutionEventSchema.parse(job.data.payload);
  const id = delayedTraceExecutionId(projectId, traceId);
  if (!isDelayedTraceExecutionEnabled(id)) return;
  const queue = DelayedTraceExecutionQueue.getInstance();
  if (!queue) throw new Error("Trace observation read Redis unavailable");
  const client = await queue.client;
  const minimum = await client.get(queue.toKey(`minimum:${id}`));
  // This is the retained activity window, not a durable trace start. If the
  // cache expired, omit the lower bound rather than substitute arrival time.
  const result = await getObservationsForTraceFromEventsTable({
    projectId,
    traceId,
    timestamp: minimum === null ? undefined : new Date(Number(minimum)),
    maxStartTime: new Date(lastSeenStartTime),
    selectIOAndMetadata: true,
    selectToolData: true,
  });
  // Simulate downstream transcript/LLM work while occupying the active job.
  if (env.LANGFUSE_DELAYED_TRACE_EXECUTION_PROCESSING_DELAY_MS > 0) {
    await sleep(env.LANGFUSE_DELAYED_TRACE_EXECUTION_PROCESSING_DELAY_MS);
  }
  // Do not persist observation I/O in the BullMQ result.
  return {
    observationCount: result.observations.length,
    hasMore: result.totalCount > result.observations.length,
  };
};
