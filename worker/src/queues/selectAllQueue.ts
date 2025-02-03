import { Job } from "bullmq";
import { traceException, logger } from "@langfuse/shared/src/server";
import { QueueName, TQueueJobTypes } from "@langfuse/shared/src/server";
import { handleSelectAllJob } from "../features/selectAll/handleSelectAllJob";

export const selectAllQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.SelectAllQueue]>,
) => {
  try {
    logger.info("Executing Batch Export Job", job.data.payload);
    await handleSelectAllJob(job);
    logger.info("Finished Select All Job", job.data.payload);

    return true;
  } catch (e) {
    // TODO: show error in client to communicate to the user
    logger.error(`Failed Select All job for id ${job.id}`, e);
    traceException(e);
    throw e;
  }
};
