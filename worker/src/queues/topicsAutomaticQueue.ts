import { type Processor } from "bullmq";
import {
  TopicAutomaticBatchSchema,
  type QueueName,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";
import { isTopicsProjectEnabled } from "@langfuse/shared/topics/server";
import { processAutomaticTopicAssignments } from "../features/topics/automaticTopics";

export const topicsAutomaticQueueProcessor: Processor<
  TQueueJobTypes[QueueName.TopicsAutomatic]
> = async (job) => {
  const batch = TopicAutomaticBatchSchema.parse(job.data.payload);
  // A disabled project's traces are caught up by its next Update topics.
  if (!isTopicsProjectEnabled(batch.projectId)) return;
  await processAutomaticTopicAssignments(batch);
};
