import { Queue } from "bullmq";
import { QueueName, QueueJobs } from "../queues";
import { createBullMQQueueOptionsWithRedis } from "./redis";
import { scheduleRecurringJob } from "./scheduleRecurringJob";
import { logger } from "../logger";

/**
 * Runs the batch inference tick once a minute: submits pending deferred LLM
 * calls as provider batch jobs, polls open jobs and resumes the evaluations
 * whose calls finished.
 */
export class LlmBatchQueue {
  private static instance: Queue | null = null;

  public static getInstance(): Queue | null {
    if (LlmBatchQueue.instance) {
      return LlmBatchQueue.instance;
    }

    const queueOptionsWithRedis = createBullMQQueueOptionsWithRedis(
      QueueName.LlmBatchQueue,
    );
    LlmBatchQueue.instance = queueOptionsWithRedis
      ? new Queue(QueueName.LlmBatchQueue, {
          ...queueOptionsWithRedis,
          defaultJobOptions: {
            removeOnComplete: true,
            removeOnFail: 100,
            // The next tick picks up whatever this one left; never retry.
            attempts: 1,
          },
        })
      : null;

    LlmBatchQueue.instance?.on("error", (err) => {
      logger.error("LlmBatchQueue error", err);
    });

    if (LlmBatchQueue.instance) {
      logger.debug("Scheduling jobs for LlmBatchQueue");
      scheduleRecurringJob(LlmBatchQueue.instance, {
        jobName: QueueJobs.LlmBatchJob,
        pattern: "0 * * * * *", // every minute (with seconds precision)
        data: { timestamp: new Date() },
      });
    }

    return LlmBatchQueue.instance;
  }
}
