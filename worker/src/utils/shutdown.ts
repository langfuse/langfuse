import { ClickHouseClientManager, logger } from "@langfuse/shared/src/server";
import { redis } from "@langfuse/shared/src/server";

import { ClickhouseWriter } from "../services/ClickhouseWriter";
import { setSigtermReceived } from "../features/health";
import { server } from "../index";
import { env } from "../env";
import { freeAllTokenizers } from "../features/tokenisation/usage";
import { getTokenCountWorkerManager } from "../features/tokenisation/async-usage";
import { WorkerManager } from "../queues/workerManager";
import { logInFlightBlobExportsOnShutdown } from "../features/blobstorage/inFlightExports";
import { abortActiveInAppAgentRuns } from "../features/in-app-agent/executeInAppAgentRun";
import { prisma } from "@langfuse/shared/src/db";
import { BackgroundMigrationManager } from "../backgroundMigrations/backgroundMigrationManager";
import {
  batchProjectCleaners,
  batchDataRetentionCleaners,
  mediaRetentionCleaner,
  batchProjectMediaCleaner,
  batchProjectBlobCleaner,
  batchTraceDeletionCleaner,
  traceDeleteBatchActionRunner,
  inAppAgentIntegrityRunner,
  deletedMaskCleaner,
  queueMetricsRunner,
  monitorRunners,
  inAppAgentDlqRetryRunner,
} from "../app";

let shutdownInProgress = false;

export const onShutdown: NodeJS.SignalsListener = async (signal) => {
  if (shutdownInProgress) {
    logger.info(
      `Received ${signal} while a shutdown is in progress, ignoring.`,
    );
    return;
  }
  shutdownInProgress = true;

  logger.info(`Received ${signal}, closing server...`);
  setSigtermReceived();

  // The orchestrator SIGKILLs the container once its stop timeout elapses
  // (ECS stopTimeout, Kubernetes terminationGracePeriodSeconds). Exit shortly
  // before that on our own terms so the step that hung is logged instead of
  // surfacing as an unexplained exit code 137.
  let phase = "stopping background runners";
  const hardDeadline = setTimeout(() => {
    logger.error(
      `Shutdown did not complete within ${env.LANGFUSE_SHUTDOWN_TIMEOUT_MS}ms while ${phase}, exiting.`,
    );
    process.exit(1);
  }, env.LANGFUSE_SHUTDOWN_TIMEOUT_MS);
  hardDeadline.unref();

  try {
    // Stop accepting new connections
    server?.close();
    logger.info("Server has been closed.");

    // Stop batch project cleaners
    for (const cleaner of batchProjectCleaners) {
      cleaner.stop();
    }

    // Stop batch data retention cleaners
    for (const cleaner of batchDataRetentionCleaners) {
      cleaner.stop();
    }

    // Stop media retention cleaner
    mediaRetentionCleaner?.stop();

    // Stop batch project media cleaner
    batchProjectMediaCleaner?.stop();

    // Stop batch project blob cleaner
    batchProjectBlobCleaner?.stop();

    // Stop batch trace deletion cleaner
    batchTraceDeletionCleaner?.stop();

    // Stop durable trace-delete batch action runner
    traceDeleteBatchActionRunner?.stop();

    inAppAgentIntegrityRunner?.stop();

    // Stop deleted-mask cleaner
    deletedMaskCleaner?.stop();

    // Stop queue metrics runner
    queueMetricsRunner?.stop();

    // Stop monitor runners
    for (const runner of monitorRunners) {
      runner.stop();
    }

    inAppAgentDlqRetryRunner?.stop();

    // Before closeWorkers(), while the registry is still populated (LFE-10388).
    logInFlightBlobExportsOnShutdown();

    // Abort in-flight agent loops at their next step boundary so closeWorkers()
    // does not wait out a full agent turn; each run finishes FAILED
    // (worker_shutdown) with its events flushed.
    abortActiveInAppAgentRuns();

    // Shutdown workers (https://docs.bullmq.io/guide/going-to-production#gracefully-shut-down-workers)
    phase = "closing queue workers";
    await WorkerManager.closeWorkers();

    // Shutdown background migrations
    phase = "closing background migrations";
    await BackgroundMigrationManager.close();

    // Flush all pending writes to Clickhouse AFTER closing ingestion queue worker that is writing to it
    phase = "flushing the ClickHouse writer";
    await ClickhouseWriter.getInstance().shutdown();
    logger.info("Clickhouse writer has been shut down.");

    phase = "disconnecting Redis";
    redis?.disconnect();
    logger.info("Redis connection has been closed.");

    phase = "disconnecting Prisma";
    await prisma.$disconnect();
    logger.info("Prisma connection has been closed.");

    // Shutdown clickhouse connections
    phase = "closing ClickHouse connections";
    await ClickHouseClientManager.getInstance().closeAllConnections();

    // Shutdown tokenization worker threads
    phase = "terminating token count worker threads";
    try {
      await getTokenCountWorkerManager().terminate();
      logger.info("Token count worker threads have been terminated.");
    } catch (error) {
      logger.error("Error terminating token count worker threads", error);
    }

    freeAllTokenizers();
    logger.info("All tokenizers are cleaned up from memory.");

    // Exit explicitly: leftover handles (timers, sockets, worker threads)
    // would otherwise keep the process alive until the orchestrator kills it.
    logger.info("Shutdown complete, exiting process...");
    process.exit(0);
  } catch (error) {
    logger.error(`Shutdown failed while ${phase}, exiting.`, error);
    process.exit(1);
  }
};
