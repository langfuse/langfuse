import { Queue } from "bullmq";
import { QueueJobs, QueueName, TQueueJobTypes } from "../../queues";
import { redis } from "./redis";
import { ingestionBatchEvent } from "../ingestion/types";
import z from "zod";
import { randomUUID } from "crypto";

let legacyIngestionQueue: Queue<
  TQueueJobTypes[QueueName.LegacyIngestionQueue]
> | null = null;

export const getLegacyIngestionQueue = () => {
  if (legacyIngestionQueue) return legacyIngestionQueue;

  legacyIngestionQueue = redis
    ? new Queue<TQueueJobTypes[QueueName.LegacyIngestionQueue]>(
        QueueName.LegacyIngestionQueue,
        {
          connection: redis,
          defaultJobOptions: {
            removeOnComplete: true,
            removeOnFail: 100,
            attempts: 5,
          },
        }
      )
    : null;

  return legacyIngestionQueue;
};
