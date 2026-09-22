import { UnrecoverableError, type Processor } from "bullmq";
import { isTopicsProjectEnabled } from "@langfuse/shared/topics/server";
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
  if (!isTopicsProjectEnabled(job.data.payload.projectId))
    throw new UnrecoverableError(
      "Topics processing is not enabled for this project.",
    );
  await processTopicEmbeddingBatch(job.data.payload);
};
