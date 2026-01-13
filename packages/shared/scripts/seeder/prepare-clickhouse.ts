import { SeederOrchestrator } from "./utils/seeder-orchestrator";
import { SeederOptions } from "./utils/types";
import { logger } from "../../src/server";

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
    logger.info("ClickHouse preparation completed successfully");
  } catch (error) {
    logger.error("ClickHouse preparation failed:", error);
    throw error;
  }
};
