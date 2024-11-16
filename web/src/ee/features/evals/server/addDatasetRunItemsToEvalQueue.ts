import { env } from "@/src/env.mjs";
import { DatasetRunItemUpsertQueue } from "../../../../../../packages/shared/dist/src/server/redis/datasetRunItemUpsert";
import { randomUUID } from "crypto";
import { QueueJobs, redis } from "@langfuse/shared/src/server";

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
  if (redis && env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
    const queue = DatasetRunItemUpsertQueue.getInstance();

    if (queue) {
      await queue.add(
        QueueJobs.DatasetRunItemUpsert,
        {
          payload: {
            projectId,
            datasetItemId: datasetItemId,
            traceId,
            observationId: observationId ?? undefined,
          },
          id: randomUUID(),
          timestamp: new Date(),
          name: QueueJobs.DatasetRunItemUpsert as const,
        },
        {
          attempts: 3, // retry 3 times
          backoff: {
            type: "exponential",
            delay: 1000,
          },
          delay: 10000, // 10 seconds
          removeOnComplete: true,
          removeOnFail: 1_000,
        },
      );
    }
  }
};
