import { Processor } from "bullmq";

import { redis, QueueJobs } from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import {
  clickhouseClient,
  logger,
  getIngestionFlushQueue,
  recordIncrement,
  recordGauge,
  recordHistogram,
} from "@langfuse/shared/src/server";
import { ClickhouseWriter } from "../services/ClickhouseWriter";
import { IngestionService } from "../services/IngestionService";

const ingestionFlushQueue = getIngestionFlushQueue();

export const ingestionFlushQueueProcessor: Processor = async (job) => {
  if (job.name === QueueJobs.FlushIngestionEntity) {
    const flushKey = job.id;
    if (!flushKey) {
      throw new Error("Flushkey not provided");
    }

    // Log wait time
    const waitTime = Date.now() - job.timestamp;
    recordIncrement("langfuse.queue.ingestion_flush.request");
    recordHistogram("langfuse.queue.ingestion_flush.wait_time", waitTime, {
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
        clickhouseClient,
      ).flush(flushKey);

      // Log processing time
      const processingTime = Date.now() - processingStartTime;
      logger.debug(
        `Prepared and scheduled CH-write in ${processingTime} ms for ${flushKey}`,
      );
      recordHistogram(
        "langfuse.queue.ingestion_flush.processing_time",
        processingTime,
        {
          unit: "milliseconds",
        },
      );

      // Log queue size
      await ingestionFlushQueue
        .count()
        .then((count) => {
          logger.debug(`Ingestion flush queue length: ${count}`);
          recordGauge("langfuse.queue.ingestion_flush.length", count, {
            unit: "records",
          });
          return count;
        })
        .catch();
    } catch (err) {
      logger.error(`Error processing flush request for ${flushKey}`, err);
      throw err;
    }
  }
};
