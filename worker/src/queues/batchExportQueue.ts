import { Job, Queue, Worker } from "bullmq";

import {
  BaseError,
  BatchExportStatus,
  QueueName,
  TQueueJobTypes,
} from "@langfuse/shared";
import { kyselyPrisma } from "@langfuse/shared/src/db";
import * as Sentry from "@sentry/node";

import { instrumentAsync } from "../instrumentation";
import logger from "../logger";
import { redis } from "../redis";
import { handleBatchExportJob } from "../features/batchExport/handleBatchExportJob";

export const batchExportQueue = redis
  ? new Queue<TQueueJobTypes[QueueName.BatchExport]>(QueueName.BatchExport, {
      connection: redis,
    })
  : null;

export const batchExportJobExecutor = redis
  ? new Worker<TQueueJobTypes[QueueName.BatchExport]>(
      QueueName.BatchExport,
      async (job: Job<TQueueJobTypes[QueueName.BatchExport]>) => {
        return instrumentAsync(
          { name: "batchExportJobExecutor" },
          async (span) => {
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
              Sentry.captureException(e);

              throw e;
            } finally {
              span?.end();
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
