import { Queue, Worker } from "bullmq";

import { redis } from "../redis";
import { QueueJobs, QueueName } from "@langfuse/shared";
import { env } from "../env";
import logger from "../logger";
import { IngestionService } from "../services/IngestionService";
import { ClickhouseWriter } from "../services/ClickhouseWriter";

export type IngestionFlushQueue = Queue<null>;

export const ingestionFlushQueue: IngestionFlushQueue | null = redis
  ? new Queue<null>(QueueName.IngestionFlushQueue, {
      connection: redis,
      defaultJobOptions: {
        removeOnComplete: true, // Important: If not true, new jobs for that ID would be ignored as jobs in the complete set are still considered as part of the queue
        removeOnFail: true,
        delay: env.INGESTION_FLUSH_JOB_DELAY,
        attempts: env.INGESTION_FLUSH_JOB_ATTEMPTS,
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
            60 * 60 // TODO: Make this configurable
          ).flush(projectEntityId);

          logger.info(
            `Prepared and scheduled CH-write in ${Date.now() - job.timestamp} ms for ${projectEntityId}`
          );
        }
      },
      {
        connection: redis,
        concurrency: env.INGESTION_FLUSH_WORKER_CONCURRENCY,
      }
    )
  : null;
