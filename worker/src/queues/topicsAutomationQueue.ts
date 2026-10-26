import { type Processor } from "bullmq";
import {
  TopicAutomationBatchSchema,
  type QueueName,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";
import { isTopicsProjectEnabled } from "@langfuse/shared/topics/server";
import { processTopicsAutomation } from "../features/topics/topicsAutomation";

export const topicsAutomationQueueProcessor: Processor<
  TQueueJobTypes[QueueName.TopicsAutomation]
> = async (job) => {
  const batch = TopicAutomationBatchSchema.parse(job.data.payload);
  // A disabled project's traces are caught up by its next Update topics.
  if (!isTopicsProjectEnabled(batch.projectId)) return;
  await processTopicsAutomation(batch);
};
