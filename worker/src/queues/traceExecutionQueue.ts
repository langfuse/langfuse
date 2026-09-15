import { Processor } from "bullmq";
import {
  getObservationsForTraceFromEventsTable,
  QueueName,
  redis,
  TraceExecutionEventSchema,
  TQueueJobTypes,
} from "@langfuse/shared/src/server";
import {
  isTraceExecutionEnabled,
  traceExecutionId,
} from "../features/traces/traceExecution";

const TRACE_QUERY_BUFFER_MS = 2 * 60_000;

export const traceExecutionProcessor: Processor<
  TQueueJobTypes[QueueName.TraceExecution]
> = async (job) => {
  const { projectId, traceId, lastSeenStartTime } =
    TraceExecutionEventSchema.parse(job.data.payload);
  const id = traceExecutionId(projectId, traceId);
  if (!isTraceExecutionEnabled(id)) return;
  if (!redis) throw new Error("Trace observation read Redis unavailable");
  const minimum = await redis.zscore(`trace-minimum:${id}`, "first_seen");
  // This is the retained activity window, not a durable trace start. If the
  // cache expired, omit the lower bound rather than substitute arrival time.
  const result = await getObservationsForTraceFromEventsTable({
    projectId,
    traceId,
    minStartTime:
      minimum === null
        ? undefined
        : new Date(Number(minimum) - TRACE_QUERY_BUFFER_MS),
    maxStartTime: new Date(lastSeenStartTime + TRACE_QUERY_BUFFER_MS),
    selectIOAndMetadata: true,
    selectToolData: true,
  });
  // Do not persist observation I/O in the BullMQ result.
  return {
    observationCount: result.observations.length,
    hasMore: result.totalCount > result.observations.length,
  };
};
