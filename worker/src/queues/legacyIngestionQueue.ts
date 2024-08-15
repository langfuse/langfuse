import { Job, Worker } from "bullmq";
import {
  getLegacyIngestionQueue,
  QueueName,
  TQueueJobTypes,
} from "@langfuse/shared/src/server";
import logger from "../logger";

import {
  handleBatch,
  redis,
  sendToWorkerIfEnvironmentConfigured,
} from "@langfuse/shared/src/server";
import { instrumentAsync } from "../instrumentation";
import * as Sentry from "@sentry/node";
import { tokenCount } from "../features/tokenisation/usage";
import { env } from "../env";

export const legacyIngestionExecutor = redis
  ? new Worker<TQueueJobTypes[QueueName.LegacyIngestionQueue]>(
      QueueName.LegacyIngestionQueue,
      async (job: Job<TQueueJobTypes[QueueName.LegacyIngestionQueue]>) => {
        return instrumentAsync({ name: "legacyIngestion" }, async () => {
          try {
            logger.info(
              `Processing legacy ingestion for payload ${JSON.stringify(job.data.payload)}`
            );

            // Log wait time
            const waitTime = Date.now() - job.timestamp;
            logger.debug(
              `Received flush request after ${waitTime} ms for ${job.data.payload.authCheck.scope.projectId}`
            );

            Sentry.metrics.increment("legacy_ingestion_processing_request");
            Sentry.metrics.distribution(
              "legacy_ingestion_flush_wait_time",
              waitTime,
              {
                unit: "milliseconds",
              }
            );

            const result = await handleBatch(
              job.data.payload.data,
              job.data.payload.authCheck,
              tokenCount
            );

            // send out REDIS requests to worker for all trace types
            await sendToWorkerIfEnvironmentConfigured(
              result.results,
              job.data.payload.authCheck.scope.projectId
            );

            // Log queue size
            await getLegacyIngestionQueue()
              ?.count()
              .then((count) => {
                logger.info(`Legacy Ingestion flush queue length: ${count}`);
                Sentry.metrics.gauge(
                  "legacy_ingestion_flush_queue_length",
                  count,
                  {
                    unit: "records",
                  }
                );
                return count;
              })
              .catch();
          } catch (e) {
            logger.error(
              e,
              `Failed job Evaluation for traceId ${job.data.payload} ${e}`
            );
            Sentry.captureException(e);
            throw e;
          }
        });
      },
      {
        connection: redis,
        concurrency: env.LANGFUSE_LEGACY_INGESTION_WORKER_CONCURRENCY, // n ingestion batches at a time
      }
    )
  : null;
