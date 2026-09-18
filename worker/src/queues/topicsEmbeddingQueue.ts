import { type Processor } from "bullmq";
import {
  QueueJobs,
  QueueName,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";
import { processTopicEmbeddingBatch } from "../features/topics/processTopicEmbeddingBatch";

export const topicsEmbeddingQueueProcessor: Processor<
  TQueueJobTypes[QueueName.TopicsEmbedding]
> = async (job) => {
  if (job.name !== QueueJobs.TopicsEmbedding) return;
  await processTopicEmbeddingBatch(job.data.payload);
};
