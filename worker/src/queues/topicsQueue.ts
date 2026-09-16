import { type Processor } from "bullmq";
import {
  QueueJobs,
  QueueName,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";
import { processTopicsExecution } from "../features/topics/processTopicsExecution";

export const topicsQueueProcessor: Processor<
  TQueueJobTypes[QueueName.Topics]
> = async (job) => {
  if (job.name !== QueueJobs.Topics) return;
  await processTopicsExecution(job.data.payload);
};
