import { ClickHouseClientManager, logger } from "@langfuse/shared/src/server";
import { disconnectAllRedisInstances } from "@langfuse/shared/src/server";

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
  traceBatchDispatcher,
  traceBatchMetricsRunner,
} from "../app";

let shutdownInProgress = false;

// Names the step the drain is currently on, so a shutdown that runs out of
// time says which one hung instead of only that it did.
let shutdownPhase = "stopping background runners";

export const onShutdown: NodeJS.SignalsListener = async (signal) => {
  if (shutdownInProgress) {
    logger.info(
      `Received ${signal} while a shutdown is in progress, ignoring.`,
    );
    return;
  }
  shutdownInProgress = true;

  logger.info(`Received ${signal}, closing server...`);

  // The orchestrator SIGKILLs the container once its stop timeout elapses (ECS
  // stopTimeout, Kubernetes terminationGracePeriodSeconds). Exit shortly before
  // that on our own terms, so a stuck step is logged instead of surfacing as an
  // unexplained exit code 137. Unref'd: it must not itself hold the loop open.
  const hardDeadline = setTimeout(() => {
    logger.error(
      `Shutdown did not complete within ${env.LANGFUSE_SHUTDOWN_TIMEOUT_MS}ms while ${shutdownPhase}, exiting.`,
    );
    process.exit(1);
  }, env.LANGFUSE_SHUTDOWN_TIMEOUT_MS);
  hardDeadline.unref();

  try {
    await drainAndClose();
  } catch (error) {
    logger.error(`Shutdown failed while ${shutdownPhase}, exiting.`, error);
    process.exit(1);
  }

  // Exit explicitly. A drained worker still holds handles that keep the event
  // loop alive — the dedicated Redis client behind every queue above all — so
  // Node would otherwise sit here until the orchestrator kills it. The fatal
  // error path owns its own exit, hence this lives here and not in the drain.
  process.exit(0);
};

let drainPromise: Promise<void> | null = null;

// Flip readiness to unhealthy, stop accepting new work, drain in-flight jobs
// and flush pending writes, then close connections. Shared by the
// SIGTERM/SIGINT path and the fatal-error path; memoized so concurrent
// triggers reuse one drain instead of closing workers/connections twice.
export const drainAndClose = (): Promise<void> => {
  if (!drainPromise) {
    drainPromise = runDrainAndClose();
  }
  return drainPromise;
};

const runDrainAndClose = async () => {
  setSigtermReceived();

  server?.close();
  logger.info("Server has been closed.");

  // Give in-flight dispatch up to five seconds before continuing shutdown.
  await traceBatchDispatcher?.drain();

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
  traceBatchMetricsRunner?.stop();

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
  shutdownPhase = "closing queue workers";
  await WorkerManager.closeWorkers();

  // Shutdown background migrations
  shutdownPhase = "closing background migrations";
  await BackgroundMigrationManager.close();

  // Flush all pending writes to Clickhouse AFTER closing ingestion queue worker that is writing to it
  shutdownPhase = "flushing the ClickHouse writer";
  await ClickhouseWriter.getInstance().shutdown();
  logger.info("Clickhouse writer has been shut down.");

  // Closes the shared client and every per-queue client in one pass. Each
  // queue holds its own client; without this they stay connected, retry
  // forever, and keep the event loop alive so the process never exits.
  const closedRedisConnections = disconnectAllRedisInstances();
  logger.info(
    `Redis connections have been closed (${closedRedisConnections} clients).`,
  );

  shutdownPhase = "disconnecting Prisma";
  await prisma.$disconnect();
  logger.info("Prisma connection has been closed.");

  // Shutdown clickhouse connections
  shutdownPhase = "closing ClickHouse connections";
  await ClickHouseClientManager.getInstance().closeAllConnections();

  // Shutdown tokenization worker threads
  shutdownPhase = "terminating token count worker threads";
  try {
    await getTokenCountWorkerManager().terminate();
    logger.info("Token count worker threads have been terminated.");
  } catch (error) {
    logger.error("Error terminating token count worker threads", error);
  }

  shutdownPhase = "freeing tokenizers";
  freeAllTokenizers();
  logger.info("All tokenizers are cleaned up from memory.");

  logger.info("Shutdown complete, exiting process...");
};
