import { Job, Processor } from "bullmq";
import { QueueName, TQueueJobTypes } from "@langfuse/shared/src/server";

import { processClickhouseDatasetRunItemsDelete } from "../features/dataset-run-items/processClickhouseDatasetRunItemsDelete";

export const datasetRunItemsDeleteProcessor: Processor = async (
  job: Job<TQueueJobTypes[QueueName.DatasetRunItemsDelete]>,
): Promise<void> => {
  const { projectId, datasetRunId, datasetId } = job.data.payload;
  await processClickhouseDatasetRunItemsDelete(
    projectId,
    datasetRunId,
    datasetId,
  );
};
