import { Job } from "bullmq";
import { logger, QueueName, TQueueJobTypes } from "@langfuse/shared/src/server";
import { promptVersionChangeWorker } from "../features/promptVersionChange/promptVersionChangeWorker";

export const promptVersionChangeQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.PromptVersionChangeQueue]>,
) => {
  logger.debug(
    `Processing prompt version change event for prompt ${job.data.payload.promptId} for project ${job.data.payload.projectId}, event: ${JSON.stringify(
      job.data,
      null,
      2,
    )}`,
  );
  return await promptVersionChangeWorker(job.data.payload);
};
