import logger from "../logger";

import { evalJobCreator, evalJobExecutor } from "../queues/evalQueue";
import { batchExportJobExecutor } from "../queues/batchExportQueue";
import { flushIngestionQueueExecutor } from "../queues/ingestionFlushQueue";
import { repeatQueueExecutor } from "../queues/repeatQueue";

export const gracefulShutdown: NodeJS.SignalsListener = async (signal) => {
  logger.info(`Received ${signal}, closing server...`);

  // Docs: https://docs.bullmq.io/guide/going-to-production#gracefully-shut-down-workers
  const workers = [
    evalJobCreator,
    evalJobExecutor,
    batchExportJobExecutor,
    flushIngestionQueueExecutor,
    repeatQueueExecutor,
  ];

  await Promise.all(workers.map((worker) => worker?.close()));

  logger.info("Server closed, exiting process...");
  process.exit(0);
};
