import { Job, Queue } from "bullmq";
import {
  createNewRedisInstance,
  QueueName,
  TQueueJobTypes,
  logger,
  traceException,
  redisQueueRetryOptions,
} from "@langfuse/shared/src/server";
import { createExperimentJob } from "../ee/experiments/experimentService";

export class ExperimentCreateQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.ExperimentCreate]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.ExperimentCreate]
  > | null {
    if (ExperimentCreateQueue.instance) return ExperimentCreateQueue.instance;

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    ExperimentCreateQueue.instance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.ExperimentCreate]>(
          QueueName.ExperimentCreate,
          {
            connection: newRedis,
            defaultJobOptions: {
              removeOnComplete: true,
              removeOnFail: 10_000,
              attempts: 2,
              backoff: {
                type: "exponential",
                delay: 5000,
              },
            },
          },
        )
      : null;

    ExperimentCreateQueue.instance?.on("error", (err) => {
      logger.error("ExperimentCreateQueue error", err);
    });

    return ExperimentCreateQueue.instance;
  }
}

export const experimentCreateQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.ExperimentCreate]>,
) => {
  try {
    logger.info("Starting to process experiment create job", {
      jobId: job.id,
      attempt: job.attemptsMade,
      data: job.data,
    });
    await createExperimentJob({
      event: job.data.payload,
    });
    return true;
  } catch (e) {
    logger.error("Failed to process experiment create job", e);
    traceException(e);
    throw e;
  }
};
