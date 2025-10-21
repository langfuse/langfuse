import { Job } from "bullmq";

import {
  BaseError,
  BatchExportStatus,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { kyselyPrisma, prisma } from "@langfuse/shared/src/db";

import { traceException, logger } from "@langfuse/shared/src/server";
import { QueueName, TQueueJobTypes } from "@langfuse/shared/src/server";
import { handleBatchExportJob } from "../features/batchExport/handleBatchExportJob";

export const batchExportQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.BatchExport]>,
) => {
  try {
    logger.info("Executing Batch Export Job", job.data.payload);
    await handleBatchExportJob(job.data.payload);

    logger.info("Finished Batch Export Job", job.data.payload);

    return true;
  } catch (e) {
    if (e instanceof LangfuseNotFoundError) {
      logger.warn(
        `Batch export ${job.data.payload.batchExportId} not found. Job will be skipped.`,
      );
      return true;
    }

    // Check if the batch export is older than 30 days
    const batchExport = await prisma.batchExport.findFirst({
      where: {
        id: job.data.payload.batchExportId,
        projectId: job.data.payload.projectId,
      },
      select: {
        createdAt: true,
      },
    });

    if (batchExport) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const isOlderThan30Days = batchExport.createdAt < thirtyDaysAgo;

      if (isOlderThan30Days) {
        // For old exports, acknowledge with an informative message
        const improvedExportMessage =
          "This export failed because it was created before recent improvements to the batch export system. Please retry your export to benefit from the latest enhancements.";

        await prisma.batchExport.update({
          where: {
            id: job.data.payload.batchExportId,
            projectId: job.data.payload.projectId,
          },
          data: {
            status: BatchExportStatus.FAILED,
            finishedAt: new Date(),
            log: improvedExportMessage,
          },
        });

        logger.info(
          `Batch export ${job.data.payload.batchExportId} is older than 30 days. Marked as failed with retry message and acknowledged.`,
        );

        return true; // Acknowledge the job without throwing
      }
    }

    // For recent exports, handle errors normally
    const displayError =
      e instanceof BaseError ? e.message : "An internal error occurred";

    await kyselyPrisma.$kysely
      .updateTable("batch_exports")
      .set("status", BatchExportStatus.FAILED)
      .set("finished_at", new Date())
      .set("log", displayError)
      .where("id", "=", job.data.payload.batchExportId)
      .where("project_id", "=", job.data.payload.projectId)
      .execute();

    logger.error(
      `Failed Batch Export job for id ${job.data.payload.batchExportId} and project id ${job.data.payload.projectId}`,
      e,
    );
    traceException(e);
    throw e;
  }
};
