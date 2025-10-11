import { DatasetDeleteQueue } from "../redis/datasetDelete";
import { QueueJobs } from "../queues";
import { randomUUID } from "crypto";
import { InternalServerError } from "../..";

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
  const datasetDeleteQueue = DatasetDeleteQueue.getInstance();
  if (!datasetDeleteQueue) {
    throw new InternalServerError("DatasetDeleteQueue not initialized");
  }
  await datasetDeleteQueue.add(QueueJobs.DatasetDelete, {
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
};
