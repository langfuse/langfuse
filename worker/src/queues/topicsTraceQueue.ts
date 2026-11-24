import { type Job, type Processor } from "bullmq";
import {
  getCurrentSpan,
  QueueJobs,
  recordDistribution,
  recordIncrement,
  TopicsTraceEventSchema,
  TopicsTraceQueue,
  type QueueName,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";
import { isFinalBullmqAttempt } from "../features/integrations/bullmqAttempts";
import { retryLLMRateLimitError } from "../features/utils/retry-handler";
import { processTopicsTrace } from "../features/topics/processTopicsTrace";

// Retries 1, 3 and 10 minutes after the first attempt, each in a fresh per-minute quota window; nothing runs after 20 minutes.
const TOPICS_TRACE_RETRY_SCHEDULE = {
  offsetsSeconds: [60, 3 * 60, 10 * 60],
  maxAgeSeconds: 20 * 60,
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
    const attempt = job.data.retryBaggage?.attempt ?? 0;
    // A throw records no outcome; after the last attempt nothing retries the trace.
    const countLastFailure = (error: unknown) => {
      if (isFinalBullmqAttempt(job, error))
        recordIncrement("langfuse.topics.trace_outcomes", 1, {
          source: "trace_queue",
          outcome: "failed",
          attempt: attempt ? "retry" : "first",
          reason: "job_failed",
          owner: "platform",
        });
      throw error;
    };
    return processTopicsTrace(event, {
      attempt,
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
    }).catch(countLastFailure);
  };
