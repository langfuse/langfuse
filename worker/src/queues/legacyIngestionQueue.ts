import { Job, Worker } from "bullmq";
import {
  addExceptionToSpan,
  getLegacyIngestionQueue,
  instrumentAsync,
  QueueName,
  recordCount,
  recordGauge,
  recordHistogram,
  TQueueJobTypes,
} from "@langfuse/shared/src/server";
import logger from "../logger";

import {
  handleBatch,
  redis,
  sendToWorkerIfEnvironmentConfigured,
} from "@langfuse/shared/src/server";
import { tokenCount } from "../features/tokenisation/usage";
import { env } from "../env";
import { SpanKind } from "@opentelemetry/api";

export const legacyIngestionExecutor = redis
  ? new Worker<TQueueJobTypes[QueueName.LegacyIngestionQueue]>(
      QueueName.LegacyIngestionQueue,
      async (job: Job<TQueueJobTypes[QueueName.LegacyIngestionQueue]>) => {
        return instrumentAsync(
          {
            name: "legacyIngestion",
            traceScope: "legacy-ingestion",
            spanKind: SpanKind.CONSUMER,
          },
          async () => {
            try {
              logger.info(
                `Processing legacy ingestion for payload ${JSON.stringify(job.data.payload)}`
              );

              // Log wait time
              const waitTime = Date.now() - job.timestamp;
              logger.debug(
                `Received flush request after ${waitTime} ms for ${job.data.payload.authCheck.scope.projectId}`
              );

              recordCount("legacy_ingestion_processing_request");
              recordHistogram("legacy_ingestion_flush_wait_time", waitTime, {
                unit: "milliseconds",
              });

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
                  recordGauge("legacy_ingestion_flush_queue_length", count, {
                    unit: "records",
                  });
                  return count;
                })
                .catch();
            } catch (e) {
              logger.error(
                e,
                `Failed job Evaluation for traceId ${job.data.payload} ${e}`
              );
              addExceptionToSpan(e);
              throw e;
            }
          }
        );
      },
      {
        connection: redis,
        concurrency: env.LANGFUSE_LEGACY_INGESTION_WORKER_CONCURRENCY, // n ingestion batches at a time
      }
    )
  : null;
