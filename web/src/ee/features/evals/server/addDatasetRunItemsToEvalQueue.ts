import { randomUUID } from "crypto";
import {
  QueueJobs,
  DatasetRunItemUpsertQueue,
  redis,
} from "@langfuse/shared/src/server";

export const addDatasetRunItemsToEvalQueue = async ({
  projectId,
  datasetItemId,
  traceId,
  observationId,
}: {
  projectId: string;
  datasetItemId: string;
  traceId: string;
  observationId?: string;
}) => {
  if (redis) {
    const queue = DatasetRunItemUpsertQueue.getInstance();

    if (queue) {
      await queue.add(QueueJobs.DatasetRunItemUpsert, {
        payload: {
          projectId,
          datasetItemId: datasetItemId,
          traceId,
          observationId: observationId ?? undefined,
        },
        id: randomUUID(),
        timestamp: new Date(),
        name: QueueJobs.DatasetRunItemUpsert as const,
      });
    }
  }
};
