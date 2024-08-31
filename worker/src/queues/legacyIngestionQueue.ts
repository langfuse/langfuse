import { Job, Worker } from "bullmq";
import {
  traceException,
  getLegacyIngestionQueue,
  instrumentAsync,
  QueueName,
  recordIncrement,
  recordGauge,
  recordHistogram,
  TQueueJobTypes,
  createNewRedisInstance,
} from "@langfuse/shared/src/server";
import logger from "../logger";

import {
  handleBatch,
  sendToWorkerIfEnvironmentConfigured,
} from "@langfuse/shared/src/server";
import { tokenCount } from "../features/tokenisation/usage";
import { env } from "../env";
import { SpanKind } from "@opentelemetry/api";

const createLegacyIngestionExecutor = () => {
  const redisInstance = createNewRedisInstance();
  if (redisInstance) {
    return new Worker<TQueueJobTypes[QueueName.LegacyIngestionQueue]>(
      QueueName.LegacyIngestionQueue,
      async (job: Job<TQueueJobTypes[QueueName.LegacyIngestionQueue]>) => {
        return instrumentAsync(
          {
            name: "legacyIngestion",
            spanKind: SpanKind.CONSUMER,
            rootSpan: true,
          },
          async () => {
            try {
              const startTime = Date.now();
              logger.info(
                `Processing legacy ingestion for payload ${JSON.stringify(job.data.payload)}`
              );

              // Log wait time
              const waitTime = Date.now() - job.timestamp;
              logger.debug(
                `Received flush request after ${waitTime} ms for ${job.data.payload.authCheck.scope.projectId}`
              );

              recordIncrement("legacy_ingestion_processing_request");
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
              recordHistogram(
                "legacy_ingestion_processing_time",
                Date.now() - startTime,
                { unit: "milliseconds" }
              );
            } catch (e) {
              logger.error(
                e,
                `Failed job Evaluation for traceId ${job.data.payload} ${e}`
              );
              traceException(e);
              throw e;
            }
          }
        );
      },
      {
        connection: redisInstance,
        concurrency: env.LANGFUSE_LEGACY_INGESTION_WORKER_CONCURRENCY, // n ingestion batches at a time
      }
    );
  }
  return null;
};

export const legacyIngestionExecutor = createLegacyIngestionExecutor();
