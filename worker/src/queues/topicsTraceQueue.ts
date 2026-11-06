import { type Job, type Processor } from "bullmq";
import {
  getCurrentSpan,
  QueueJobs,
  recordDistribution,
  TopicsTraceEventSchema,
  TopicsTraceQueue,
  type QueueName,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";
import { retryLLMRateLimitError } from "../features/utils/retry-handler";
import { processTopicsTrace } from "../features/topics/processTopicsTrace";

// Retries 1, 6 and 16 minutes after the first attempt; nothing runs after 30 minutes.
const TOPICS_TRACE_RETRY_SCHEDULE = {
  offsetsSeconds: [60, 6 * 60, 16 * 60],
  maxAgeSeconds: 30 * 60,
};

/** Provider failures are requeued on the same shard with only the facets that failed. */
export const topicsTraceQueueProcessorBuilder =
  (shardName: string): Processor =>
  async (job: Job<TQueueJobTypes[QueueName.TopicsTrace]>) => {
    const event = TopicsTraceEventSchema.parse(job.data.payload);
    if (job.attemptsMade === 0 && !job.data.retryBaggage)
      recordDistribution(
        "langfuse.topics.trace.time_to_first_attempt_ms",
        Date.now() - new Date(job.data.timestamp).getTime(),
        { unit: "milliseconds" },
      );
    getCurrentSpan()?.setAttributes({
      "messaging.bullmq.job.input.projectId": event.projectId,
      "messaging.bullmq.job.input.traceId": event.traceId,
      "messaging.bullmq.job.input.retryBaggage.attempt":
        job.data.retryBaggage?.attempt ?? 0,
    });
    return processTopicsTrace(event, {
      attempt: job.data.retryBaggage?.attempt ?? 0,
      scheduleRetry: async (facetIds) => {
        const retry = await retryLLMRateLimitError(
          { data: { ...job.data, payload: { ...event, facetIds } } },
          {
            table: null,
            idField: "traceId",
            queue: TopicsTraceQueue.getInstance({ shardName }),
            queueName: shardName,
            jobName: QueueJobs.TopicsTraceJob,
            schedule: TOPICS_TRACE_RETRY_SCHEDULE,
          },
        );
        // BullMQ's attempts then rerun only the failed facets, not the stored ones.
        if (retry.outcome === "queue_unavailable")
          await job
            .updateData({ ...job.data, payload: { ...event, facetIds } })
            .catch(() => {});
        return retry.outcome;
      },
    });
  };
