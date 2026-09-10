import { Processor } from "bullmq";
import {
  getObservationsForTraceFromEventsTable,
  QueueName,
  recordDistribution,
  TraceObservationReadEventSchema,
  TraceObservationReadQueue,
  TQueueJobTypes,
} from "@langfuse/shared/src/server";
import {
  isTraceObservationReadEnabled,
  traceObservationReadId,
} from "../features/traces/traceObservationRead";

export const traceObservationReadProcessor: Processor<
  TQueueJobTypes[QueueName.TraceObservationRead]
> = async (job) => {
  const { projectId, traceId } = TraceObservationReadEventSchema.parse(
    job.data.payload,
  );
  const id = traceObservationReadId(projectId, traceId);
  if (!isTraceObservationReadEnabled(id)) return;
  const queue = TraceObservationReadQueue.getInstance();
  if (!queue) throw new Error("Trace observation read Redis unavailable");
  const client = await queue.client;
  const minimum = await client.get(queue.toKey(`minimum:${id}`));
  const startedAt = performance.now();
  let outcome = "failure";
  try {
    // This is the retained activity window, not a durable trace start. If the
    // cache expired, omit the time bound rather than substitute arrival time.
    const { observations, totalCount } =
      await getObservationsForTraceFromEventsTable({
        projectId,
        traceId,
        timestamp: minimum === null ? undefined : new Date(Number(minimum)),
        selectIOAndMetadata: true,
        selectToolData: true,
      });
    outcome = "success";
    // Do not persist observation I/O in the BullMQ result.
    return {
      observationCount: observations.length,
      hasMore: totalCount > observations.length,
    };
  } finally {
    recordDistribution(
      "langfuse.trace_observation_read.duration_ms",
      performance.now() - startedAt,
      { outcome },
    );
  }
};
