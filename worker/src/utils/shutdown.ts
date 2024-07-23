import logger from "../logger";

import { evalJobCreator, evalJobExecutor } from "../queues/evalQueue";
import { batchExportJobExecutor } from "../queues/batchExportQueue";
import { flushIngestionQueueExecutor } from "../queues/ingestionFlushQueue";
import { repeatQueueExecutor } from "../queues/repeatQueue";
import { ClickhouseWriter } from "../services/ClickhouseWriter";

export const gracefulShutdown: NodeJS.SignalsListener = async (signal) => {
  logger.info(`Received ${signal}, closing server...`);

  // Shutdown workers (https://docs.bullmq.io/guide/going-to-production#gracefully-shut-down-workers)
  const workers = [
    evalJobCreator,
    evalJobExecutor,
    batchExportJobExecutor,
    flushIngestionQueueExecutor,
    repeatQueueExecutor,
  ];

  await Promise.all(workers.map((worker) => worker?.close()));

  // Flush all pending writes to Clickhouse AFTER closing ingestion queue worker that is writing to it
  await ClickhouseWriter.getInstance().shutdown();

  logger.info("Server closed, exiting process...");
  process.exit(0);
};
