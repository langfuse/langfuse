import { type Processor } from "bullmq";
import {
  EventsDispatchEventSchema,
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
  return processEventsDispatchJob(event);
};
