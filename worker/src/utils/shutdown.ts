import logger from "../logger";

import { redis } from "@langfuse/shared/src/server";

import { evalJobCreator, evalJobExecutor } from "../queues/evalQueue";
import { batchExportJobExecutor } from "../queues/batchExportQueue";
import { flushIngestionQueueExecutor } from "../queues/ingestionFlushQueue";
import { repeatQueueExecutor } from "../queues/repeatQueue";
import { ClickhouseWriter } from "../services/ClickhouseWriter";
import { setSigtermReceived } from "../features/health";
import { server } from "../index";

export const onShutdown: NodeJS.SignalsListener = async (signal) => {
  logger.info(`Received ${signal}, closing server...`);
  setSigtermReceived();

  // Stop accepting new connections
  server.close();
  logger.info("Server has been closed.");

  // Shutdown workers (https://docs.bullmq.io/guide/going-to-production#gracefully-shut-down-workers)
  const workers = [
    evalJobCreator,
    evalJobExecutor,
    batchExportJobExecutor,
    flushIngestionQueueExecutor,
    repeatQueueExecutor,
  ];

  await Promise.all(workers.map((worker) => worker?.close()));
  logger.info("All workers have been closed.");

  // Flush all pending writes to Clickhouse AFTER closing ingestion queue worker that is writing to it
  await ClickhouseWriter.getInstance().shutdown();
  logger.info("Clickhouse writer has been shut down.");

  redis?.disconnect();
  logger.info("Redis connection has been closed.");

  logger.info("Shutdown complete, exiting process...");
};
