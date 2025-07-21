import { DatasetRunItemsDeleteQueue } from "../../server/redis/datasetRunItemsDelete";
import { QueueJobs } from "../../server/queues";
import { redis } from "../../server/redis/redis";
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
