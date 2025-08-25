import { Job, Processor } from "bullmq";
import { QueueName, TQueueJobTypes } from "@langfuse/shared/server";
import { processClickhouseDatasetDelete } from "../features/datasets/processClickhouseDatasetDelete";

export const datasetDeleteProcessor: Processor = async (
  job: Job<TQueueJobTypes[QueueName.DatasetDelete]>,
): Promise<void> => {
  await processClickhouseDatasetDelete(job.data.payload);
};
