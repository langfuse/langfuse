import { Job } from "bullmq";
import { logger, QueueName, TQueueJobTypes } from "@langfuse/shared/src/server";
import { entityChangeWorker } from "../features/entityChange/entityChangeWorker";

export const entityChangeQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.EntityChangeQueue]>,
) => {
  logger.debug(
    `Processing entity change event for entity ${job.data.payload.entityType}, event: ${JSON.stringify(
      job.data,
      null,
      2,
    )}`,
  );
  return await entityChangeWorker(job.data.payload);
};
