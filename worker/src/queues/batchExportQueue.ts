import { Job } from "bullmq";

import { BaseError, BatchExportStatus } from "@langfuse/shared";
import { kyselyPrisma } from "@langfuse/shared/src/db";

import { traceException, instrumentAsync } from "@langfuse/shared/src/server";
import logger from "../logger";
import { QueueName, TQueueJobTypes } from "@langfuse/shared/src/server";
import { handleBatchExportJob } from "../features/batchExport/handleBatchExportJob";
import { SpanKind } from "@opentelemetry/api";

export const batchExportQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.BatchExport]>,
) => {
  return instrumentAsync(
    {
      name: "batchExportJobExecutor",
      spanKind: SpanKind.CONSUMER,
    },
    async () => {
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
          e,
          `Failed Batch Export job for id ${job.data.payload.batchExportId} ${e}`,
        );
        traceException(e);
        throw e;
      }
    },
  );
};
