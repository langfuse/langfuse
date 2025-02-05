import { Job } from "bullmq";
import { traceException, logger } from "@langfuse/shared/src/server";
import { QueueName, TQueueJobTypes } from "@langfuse/shared/src/server";
import { handleBatchActionJob } from "../features/batchAction/handleBatchActionJob";

export const batchActionQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.BatchActionQueue]>,
) => {
  try {
    logger.info("Executing Batch Action Job", job.data.payload);
    await handleBatchActionJob(job);
    logger.info("Finished Batch Action Job", job.data.payload);

    return true;
  } catch (e) {
    // TODO: show error in client to communicate to the user
    logger.error(`Failed Bulk Action job for id ${job.id}`, e);
    traceException(e);
    throw e;
  }
};
