import { Job } from "bullmq";

import { BaseError, BatchExportStatus } from "@langfuse/shared";
import { kyselyPrisma } from "@langfuse/shared/src/db";

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
