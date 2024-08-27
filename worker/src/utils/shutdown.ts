import logger from "../logger";

import { redis } from "@langfuse/shared/src/server";

import { evalJobCreator, evalJobExecutor } from "../queues/evalQueue";
import { batchExportJobExecutor } from "../queues/batchExportQueue";
import { ingestionQueueExecutor } from "../queues/ingestionFlushQueueExecutor";
import { repeatQueueExecutor } from "../queues/repeatQueue";
import { ClickhouseWriter } from "../services/ClickhouseWriter";
import { setSigtermReceived } from "../features/health";
import { server } from "../index";
import { legacyIngestionExecutor } from "../queues/legacyIngestionQueue";
import { cloudUsageMeteringJobExecutor } from "../queues/cloudUsageMeteringQueue";
import { freeAllTokenizers } from "../features/tokenisation/usage";

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
    ingestionQueueExecutor,
    repeatQueueExecutor,
    legacyIngestionExecutor,
    cloudUsageMeteringJobExecutor,
  ];

  await Promise.all(workers.map(async (worker) => await worker?.close()));
  logger.info("All workers have been closed.");

  // Flush all pending writes to Clickhouse AFTER closing ingestion queue worker that is writing to it
  await ClickhouseWriter.getInstance().shutdown();
  logger.info("Clickhouse writer has been shut down.");

  redis?.disconnect();
  logger.info("Redis connection has been closed.");

  freeAllTokenizers();
  logger.info("All tokenizers are cleaned up from memory.");

  logger.info("Shutdown complete, exiting process...");
};
