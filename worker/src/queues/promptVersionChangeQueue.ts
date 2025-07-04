import { Worker } from "bullmq";
import { Job } from "bullmq";
import {
  QueueName,
  type PromptVersionChangeEventType,
  logger,
  createNewRedisInstance,
  redisQueueRetryOptions,
} from "@langfuse/shared/src/server";
import { promptVersionChangeWorker } from "../features/promptVersionChange/promptVersionChangeWorker";

export const promptVersionChangeQueueProcessor = async (
  job: Job<PromptVersionChangeEventType>,
) => {
  return await promptVersionChangeWorker(job.data);
};

export const PromptVersionChangeQueueWorker = () => {
  const connection = createNewRedisInstance({
    enableOfflineQueue: false,
  });

  if (!connection) {
    throw new Error(
      "Failed to create Redis connection for PromptVersionChangeQueue",
    );
  }

  const worker = new Worker(
    QueueName.PromptVersionChangeQueue,
    promptVersionChangeQueueProcessor,
    {
      connection,
      ...redisQueueRetryOptions,
    },
  );

  worker.on("completed", (job, result) => {
    logger.info(
      `PromptVersionChangeQueue job completed for project ${job.data.projectId}, prompt ${job.data.promptId}`,
      {
        jobId: job.id,
        projectId: job.data.projectId,
        promptId: job.data.promptId,
        action: job.data.action,
        result,
      },
    );
  });

  worker.on("failed", (job, err) => {
    logger.error(
      `PromptVersionChangeQueue job failed for project ${job?.data?.projectId}, prompt ${job?.data?.promptId}`,
      {
        jobId: job?.id,
        projectId: job?.data?.projectId,
        promptId: job?.data?.promptId,
        action: job?.data?.action,
        error: err.message,
      },
    );
  });

  return worker;
};
