import { type Job, type Processor } from "bullmq";
import {
  getCurrentSpan,
  QueueJobs,
  TopicsTraceEventSchema,
  TopicsTraceQueue,
  type QueueName,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";
import { retryLLMRateLimitError } from "../features/utils";
import { processTopicsTrace } from "../features/topics/processTopicsTrace";

/** Provider failures are requeued on the same shard with only the facets that failed. */
export const topicsTraceQueueProcessorBuilder =
  (shardName: string): Processor =>
  async (job: Job<TQueueJobTypes[QueueName.TopicsTrace]>) => {
    const event = TopicsTraceEventSchema.parse(job.data.payload);
    getCurrentSpan()?.setAttributes({
      "messaging.bullmq.job.input.projectId": event.projectId,
      "messaging.bullmq.job.input.traceId": event.traceId,
      "messaging.bullmq.job.input.retryBaggage.attempt":
        job.data.retryBaggage?.attempt ?? 0,
    });
    const result = await processTopicsTrace(event, {
      scheduleRetry: async (facets) => {
        const retry = await retryLLMRateLimitError(
          { data: { ...job.data, payload: { ...event, facets } } },
          {
            table: null,
            idField: "traceId",
            queue: TopicsTraceQueue.getInstance({ shardName }),
            queueName: shardName,
            jobName: QueueJobs.TopicsTraceJob,
          },
        );
        return retry.outcome === "scheduled";
      },
    });
    return result;
  };
