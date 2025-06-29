import { Job } from "bullmq";
import {
  QueueName,
  TQueueJobTypes,
  promptVersionChangeProcessor,
} from "@langfuse/shared/src/server";

export const promptVersionChangeQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.PromptVersionChangeQueue]>
): Promise<void> => {
  return await promptVersionChangeProcessor(job);
};