import { DatasetDeleteQueue } from "../redis/datasetDelete";
import { QueueJobs } from "../queues";
import { redis } from "../redis/redis";
import { randomUUID } from "crypto";

type DatasetDeletionType = "dataset" | "dataset-runs";

type DatasetDeletionPayload = {
  deletionType: DatasetDeletionType;
  projectId: string;
  datasetId: string;
  datasetRunIds?: string[];
};

export const addToDeleteDatasetQueue = async ({
  deletionType,
  projectId,
  datasetId,
  datasetRunIds = [],
}: DatasetDeletionPayload) => {
  if (redis) {
    await DatasetDeleteQueue.getInstance()?.add(QueueJobs.DatasetDelete, {
      payload: {
        deletionType,
        projectId,
        datasetId,
        datasetRunIds,
      },
      id: randomUUID(),
      timestamp: new Date(),
      name: QueueJobs.DatasetDelete,
    });
  }
};
