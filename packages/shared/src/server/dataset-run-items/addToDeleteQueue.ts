import { DatasetRunItemsDeleteQueue } from "../redis/datasetRunItemsDelete";
import { QueueJobs } from "../queues";
import { redis } from "../redis/redis";
import { randomUUID } from "crypto";

export const addToDeleteDatasetRunItemsQueue = async ({
  projectId,
  runId,
  datasetId,
}: {
  projectId: string;
  runId: string;
  datasetId: string;
}) => {
  if (redis) {
    await DatasetRunItemsDeleteQueue.getInstance()?.add(
      QueueJobs.DatasetRunItemsDelete,
      {
        payload: {
          projectId,
          datasetRunId: runId,
          datasetId,
        },
        id: randomUUID(),
        timestamp: new Date(),
        name: QueueJobs.DatasetRunItemsDelete,
      },
    );
  }
};
