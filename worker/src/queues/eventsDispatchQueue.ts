import { type Processor } from "bullmq";
import {
  EventsDispatchEventSchema,
  getCurrentSpan,
  instrumentAsync,
  recordIncrement,
  type QueueName,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";
import { JOB_MAX_AGE_MS } from "../features/eventsDispatch/consumers";
import {
  isEventsDispatchEnabled,
  processEventsDispatchJob,
} from "../features/eventsDispatch/eventsDispatch";

export const eventsDispatchQueueProcessor: Processor<
  TQueueJobTypes[QueueName.EventsDispatch]
> = async (job) => {
  const discard = (reason: string) => {
    // BullMQ reads these options after the processor returns, then removes atomically.
    job.opts.removeOnComplete = true;
    recordIncrement("langfuse.events_dispatch.discarded_jobs", 1, { reason });
    return { discarded: reason };
  };
  if (!isEventsDispatchEnabled()) return discard("disabled");
  const event = EventsDispatchEventSchema.parse(job.data);
  if (Date.now() - event.timestamp.getTime() >= JOB_MAX_AGE_MS)
    return discard("expired");
  // Each job is its own trace, so a dispatcher run does not collect every per-trace span.
  const workerSpan = getCurrentSpan();
  return instrumentAsync(
    { name: "events-dispatch-job", startNewTrace: true },
    async (span) => {
      span.setAttributes({
        "langfuse.events_dispatch.job_id": job.id ?? event.id,
        "langfuse.events_dispatch.attempt": job.attemptsMade + 1,
      });
      workerSpan?.setAttribute(
        "langfuse.events_dispatch.job_trace_id",
        span.spanContext().traceId,
      );
      return processEventsDispatchJob(event);
    },
  );
};
