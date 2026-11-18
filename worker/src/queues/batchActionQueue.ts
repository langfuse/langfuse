import { Job } from "bullmq";
import { traceException, logger } from "@langfuse/shared/src/server";
import { QueueName, TQueueJobTypes } from "@langfuse/shared/src/server";
import { ActionId, BatchActionStatus } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { handleBatchActionJob } from "../features/batchAction/handleBatchActionJob";
import { isFinalBullmqAttempt } from "../features/integrations/bullmqAttempts";

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

    const { payload } = job.data;
    // Without this the batch action stays in Processing once retries run out.
    if (
      payload.actionId === ActionId.ObservationBatchEvaluation &&
      isFinalBullmqAttempt(job, e)
    ) {
      await prisma.batchAction.update({
        where: { id: payload.batchActionId, projectId: payload.projectId },
        data: {
          status: BatchActionStatus.Failed,
          finishedAt: new Date(),
          log: e instanceof Error ? e.message : "Batch action failed",
        },
      });
    }

    throw e;
  }
};
