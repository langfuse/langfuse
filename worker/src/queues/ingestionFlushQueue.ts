import { Queue, Worker } from "bullmq";

import { QueueJobs, QueueName } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { clickhouseClient, redis } from "@langfuse/shared/src/server";
import * as Sentry from "@sentry/node";

import { env } from "../env";
import logger from "../logger";
import { ClickhouseWriter } from "../services/ClickhouseWriter";
import { IngestionService } from "../services/IngestionService";
import { instrumentAsync } from "../instrumentation";

export type IngestionFlushQueue = Queue<null>;

export const ingestionFlushQueue: IngestionFlushQueue | null = redis
  ? new Queue<null>(QueueName.IngestionFlushQueue, {
      connection: redis,
      defaultJobOptions: {
        removeOnComplete: true, // Important: If not true, new jobs for that ID would be ignored as jobs in the complete set are still considered as part of the queue
        removeOnFail: true,
        delay: env.LANGFUSE_INGESTION_FLUSH_DELAY_MS,
        attempts: env.LANGFUSE_INGESTION_FLUSH_ATTEMPTS,
      },
    })
  : null;

export const flushIngestionQueueExecutor = redis
  ? new Worker(
      QueueName.IngestionFlushQueue,
      async (job) => {
        return instrumentAsync(
          { name: "flush-ingestion-consumer" },
          async () => {
            if (job.name === QueueJobs.FlushIngestionEntity) {
              const projectEntityId = job.id;
              if (!projectEntityId) {
                throw new Error("ProjectEntity ID not provided");
              }

              // Log wait time
              const waitTime = Date.now() - job.timestamp;
              logger.debug(
                `Received flush request after ${waitTime} ms for ${projectEntityId}`
              );
              Sentry.metrics.distribution(
                "ingestion_flush_wait_time",
                waitTime,
                {
                  unit: "milliseconds",
                }
              );

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
                  ingestionFlushQueue,
                  ClickhouseWriter.getInstance(),
                  clickhouseClient,
                  env.LANGFUSE_INGESTION_BUFFER_TTL_SECONDS
                ).flush(projectEntityId);

                // Log processing time
                const processingTime = Date.now() - processingStartTime;
                logger.debug(
                  `Prepared and scheduled CH-write in ${processingTime} ms for ${projectEntityId}`
                );
                Sentry.metrics.distribution(
                  "ingestion_flush_processing_time",
                  processingTime,
                  { unit: "milliseconds" }
                );

                // Log queue size
                await ingestionFlushQueue
                  .count()
                  .then((count) => {
                    logger.debug(`Ingestion flush queue length: ${count}`);
                    Sentry.metrics.gauge(
                      "ingestion_flush_queue_length",
                      count,
                      {
                        unit: "records",
                      }
                    );
                    return count;
                  })
                  .catch();
              } catch (err) {
                console.error(
                  `Error processing flush request for ${projectEntityId}`,
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
