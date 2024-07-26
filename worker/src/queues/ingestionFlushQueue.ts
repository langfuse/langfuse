import { Queue, Worker } from "bullmq";

import { QueueJobs, QueueName } from "@langfuse/shared";
import { clickhouseClient, redis } from "@langfuse/shared/src/server";

import { env } from "../env";
import logger from "../logger";
import { ClickhouseWriter } from "../services/ClickhouseWriter";
import { IngestionService } from "../services/IngestionService";

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
        if (job.name === QueueJobs.FlushIngestionEntity) {
          const projectEntityId = job.id;
          if (!projectEntityId) {
            throw new Error("ProjectEntity ID not provided");
          }

          logger.debug(
            `Received flush request after ${Date.now() - job.timestamp} ms for ${projectEntityId}`
          );

          if (!redis) throw new Error("Redis not available");
          if (!prisma) throw new Error("Prisma not available");
          if (!ingestionFlushQueue)
            throw new Error("Ingestion flush queue not available");

          await new IngestionService(
            redis,
            prisma,
            ingestionFlushQueue,
            ClickhouseWriter.getInstance(),
            clickhouseClient,
            60 * 60 // TODO: Make this configurable
          ).flush(projectEntityId);

          logger.info(
            `Prepared and scheduled CH-write in ${Date.now() - job.timestamp} ms for ${projectEntityId}`
          );
        }
      },
      {
        connection: redis,
        concurrency: env.LANGFUSE_INGESTION_FLUSH_PROCESSING_CONCURRENCY,
      }
    )
  : null;
