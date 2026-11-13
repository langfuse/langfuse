import { type Processor } from "bullmq";
import {
  type QueueName,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";
import { deleteTopicRows } from "@langfuse/shared/topics/server";

export const topicsDeleteQueueProcessor: Processor<
  TQueueJobTypes[QueueName.TopicsDelete]
> = async (job) => {
  await deleteTopicRows(job.data.payload);
};
