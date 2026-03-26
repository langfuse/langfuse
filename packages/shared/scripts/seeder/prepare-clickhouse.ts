import { SeederOrchestrator } from "./utils/seeder-orchestrator";
import { SeederOptions } from "./utils/types";
import { logger, redis } from "../../src/server";

const EXPERIMENT_BACKFILL_TIMESTAMP_KEY =
  "langfuse:event-propagation:experiment-backfill:last-run";

/**
 * ClickHouse data preparation using the seeder abstraction.
 */
export const prepareClickhouse = async (
  projectIds: string[],
  opts: {
    numberOfDays: number;
    numberOfRuns?: number;
  },
) => {
  logger.info(
    `Preparing ClickHouse for ${projectIds.length} projects and ${opts.numberOfDays} days.`,
  );

  const formattedOpts: SeederOptions = {
    mode: "bulk",
    numberOfDays: opts.numberOfDays,
    numberOfRuns: opts.numberOfRuns || 1,
  };

  const orchestrator = new SeederOrchestrator();

  try {
    await orchestrator.executeFullSeed(projectIds, formattedOpts);

    // Set the backfill timestamp to 1 hour ago so the backfill picks up seed data
    // The backfill query requires: created_at > lastRun AND created_at <= upperBound
    // By setting lastRun to 1 hour ago, seed data (created at ~now) will be in range
    if (redis) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      await redis.set(EXPERIMENT_BACKFILL_TIMESTAMP_KEY, oneHourAgo);
      logger.info(
        `Set experiment backfill timestamp to ${oneHourAgo} so backfill picks up seed data`,
      );
    }

    logger.info("ClickHouse preparation completed successfully");
  } catch (error) {
    logger.error("ClickHouse preparation failed:", error);
    throw error;
  }
};
