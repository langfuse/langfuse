import { Job, Queue, Worker } from "bullmq";

import {
  BaseError,
  BatchExportStatus,
  QueueName,
  TQueueJobTypes,
} from "@langfuse/shared";
import { kyselyPrisma } from "@langfuse/shared/src/db";

import { instrumentAsync } from "../instrumentation";
import logger from "../logger";
import { redis } from "@langfuse/shared/src/server";
import { handleBatchExportJob } from "../features/batchExport/handleBatchExportJob";
import { SpanKind } from "@opentelemetry/api";

export const batchExportQueue = redis
  ? new Queue<TQueueJobTypes[QueueName.BatchExport]>(QueueName.BatchExport, {
      connection: redis,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 100,
        attempts: 2,
      },
    })
  : null;

export const batchExportJobExecutor = redis
  ? new Worker<TQueueJobTypes[QueueName.BatchExport]>(
      QueueName.BatchExport,
      async (job: Job<TQueueJobTypes[QueueName.BatchExport]>) => {
        return instrumentAsync(
          {
            name: "batchExportJobExecutor",
            root: true,
            kind: SpanKind.CONSUMER,
          },
          async () => {
            try {
              logger.info("Executing Batch Export Job", job.data.payload);
              await handleBatchExportJob(job.data.payload);

              logger.info("Finished Batch Export Job", job.data.payload);

              return true;
            } catch (e) {
              const displayError =
                e instanceof BaseError
                  ? e.message
                  : "An internal error occurred";

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
                `Failed Batch Export job for id ${job.data.payload.batchExportId} ${e}`
              );

              throw e;
            }
          }
        );
      },
      {
        connection: redis,
        concurrency: 1, // only 1 job at a time
        limiter: {
          // execute 1 batch export in 5 seconds to avoid overloading the DB
          max: 1,
          duration: 5_000,
        },
      }
    )
  : null;
