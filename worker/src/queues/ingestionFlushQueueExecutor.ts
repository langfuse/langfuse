import { Queue, Worker } from "bullmq";

import { QueueJobs, QueueName } from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import {
  clickhouseClient,
  getIngestionFlushQueue,
  instrument,
  recordIncrement,
  recordGauge,
  recordHistogram,
  redis,
} from "@langfuse/shared/src/server";
import { env } from "../env";
import logger from "../logger";
import { ClickhouseWriter } from "../services/ClickhouseWriter";
import { IngestionService } from "../services/IngestionService";
import { SpanKind } from "@opentelemetry/api";

const ingestionFlushQueue = getIngestionFlushQueue();

export const ingestionQueueExecutor = redis
  ? new Worker(
      QueueName.IngestionFlushQueue,
      async (job) => {
        return instrument(
          {
            name: "flush-ingestion-consumer",
            spanKind: SpanKind.CONSUMER,
          },
          async () => {
            if (job.name === QueueJobs.FlushIngestionEntity) {
              const flushKey = job.id;
              if (!flushKey) {
                throw new Error("Flushkey not provided");
              }

              // Log wait time
              const waitTime = Date.now() - job.timestamp;
              logger.debug(
                `Received flush request after ${waitTime} ms for ${flushKey}`
              );

              recordIncrement("ingestion_processing_request");
              recordHistogram("ingestion_flush_wait_time", waitTime, {
                unit: "milliseconds",
              });

              try {
                // Check dependencies
                if (!redis) throw new Error("Redis not available");
                if (!prisma) throw new Error("Prisma not available");
                if (!ingestionFlushQueue)
                  throw new Error("Ingestion flush queue not available");

                // Flush ingestion buffer
                const processingStartTime = Date.now();

                await new IngestionService(
                  redis,
                  prisma,
                  ClickhouseWriter.getInstance(),
                  clickhouseClient
                ).flush(flushKey);

                // Log processing time
                const processingTime = Date.now() - processingStartTime;
                logger.debug(
                  `Prepared and scheduled CH-write in ${processingTime} ms for ${flushKey}`
                );
                recordHistogram(
                  "ingestion_flush_processing_time",
                  processingTime,
                  { unit: "milliseconds" }
                );

                // Log queue size
                await ingestionFlushQueue
                  .count()
                  .then((count) => {
                    logger.debug(`Ingestion flush queue length: ${count}`);
                    recordGauge("ingestion_flush_queue_length", count, {
                      unit: "records",
                    });
                    return count;
                  })
                  .catch();
              } catch (err) {
                console.error(
                  `Error processing flush request for ${flushKey}`,
                  err
                );

                throw err;
              }
            }
          }
        );
      },
      {
        connection: redis,
        concurrency: env.LANGFUSE_INGESTION_FLUSH_PROCESSING_CONCURRENCY,
      }
    )
  : null;
