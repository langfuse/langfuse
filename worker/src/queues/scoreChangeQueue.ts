import { Job } from "bullmq";
import { QueueName, TQueueJobTypes } from "@langfuse/shared/src/server";
import { scoreProcessor } from "../features/entityChange/scoreProcessor";

export const scoreChangeQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.ScoreChangeQueue]>,
) => {
  await scoreProcessor(job.data.payload);
};
