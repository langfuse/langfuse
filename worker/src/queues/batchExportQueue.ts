import { Job } from "bullmq";

import {
  BaseError,
  BatchExportStatus,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";

import { traceException, logger } from "@langfuse/shared/src/server";
import { QueueName, TQueueJobTypes } from "@langfuse/shared/src/server";
import { handleBatchExportJob } from "../features/batchExport/handleBatchExportJob";

export const batchExportQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.BatchExport]>,
) => {
  try {
    logger.info("[BATCH EXPORT] Executing Batch Export Job", job.data.payload);
    await handleBatchExportJob(job.data.payload);

    logger.info("[BATCH EXPORT] Finished Batch Export Job", job.data.payload);

    return true;
  } catch (e) {
    if (e instanceof LangfuseNotFoundError) {
      logger.warn(
        `[BATCH EXPORT] Batch export ${job.data.payload.batchExportId} not found. Job will be skipped.`,
      );
      return true;
    }
    const displayError =
      e instanceof BaseError ? e.message : "An internal error occurred";

    await prisma.batchExport.update({
      where: {
        id: job.data.payload.batchExportId,
        projectId: job.data.payload.projectId,
      },
      data: {
        status: BatchExportStatus.FAILED,
        finishedAt: new Date(),
        log: displayError,
      },
    });

    logger.error(
      `[BATCH EXPORT] Failed Batch Export job for id ${job.data.payload.batchExportId} and project id ${job.data.payload.projectId}`,
      e,
    );
    traceException(e);
    throw e;
  }
};
