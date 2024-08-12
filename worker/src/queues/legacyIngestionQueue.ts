import { Job, Queue, Worker } from "bullmq";
import { QueueName, TQueueJobTypes } from "@langfuse/shared";
import logger from "../logger";

import { redis } from "@langfuse/shared/src/server";
import { instrumentAsync } from "../instrumentation";
import * as Sentry from "@sentry/node";

export const legacyIngestionQueue = redis
  ? new Queue<TQueueJobTypes[QueueName.LegacyIngestionQueue]>(
      QueueName.LegacyIngestionQueue,
      {
        connection: redis,
      }
    )
  : null;

export const legacyIngestionExecutor = redis
  ? new Worker<TQueueJobTypes[QueueName.LegacyIngestionQueue]>(
      QueueName.LegacyIngestionQueue,
      async (job: Job<TQueueJobTypes[QueueName.LegacyIngestionQueue]>) => {
        return instrumentAsync({ name: "legacyIngestion" }, async () => {
          try {
            return true;
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
        concurrency: 20,
        limiter: {
          // execute 75 calls in 1000ms
          max: 75,
          duration: 1000,
        },
      }
    )
  : null;
