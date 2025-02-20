import { Job } from "bullmq";
import { traceException, logger } from "@langfuse/shared/src/server";
import { QueueName, TQueueJobTypes } from "@langfuse/shared/src/server";
import { handleBatchActionJob } from "../features/batchAction/handleBatchActionJob";

export const batchActionQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.BatchActionQueue]>,
) => {
  try {
    logger.info(
      `Executing Batch Action job ${JSON.stringify(job.data.payload.actionId)}`,
    );
    await handleBatchActionJob(job.data);
    logger.info(
      `Finished Batch Action Job ${JSON.stringify(job.data.payload.actionId)}`,
    );

    return true;
  } catch (e) {
    logger.error(`Failed Batch Action job for id ${job.id}`, e);
    traceException(e);
    throw e;
  }
};
