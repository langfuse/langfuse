import { prisma } from "@langfuse/shared/src/db";
import {
  hasNoObservationEvalConfigsCache,
  setNoObservationEvalConfigsCache,
  logger,
} from "@langfuse/shared/src/server";
import { type ObservationEvalConfig } from "./types";

/**
 * Fetches active observation eval configs for a project.
 *
 * Uses a cache to avoid unnecessary database queries:
 * - If cached as "no configs", returns empty array immediately
 * - If cache miss, queries database and caches result if empty
 *
 * @param projectId - The project ID to fetch configs for
 * @returns Array of observation eval configs (empty if none exist)
 */
export async function fetchObservationEvalConfigs(
  projectId: string,
): Promise<ObservationEvalConfig[]> {
  // Check cache first
  const hasNoConfigs = await hasNoObservationEvalConfigsCache(projectId);
  if (hasNoConfigs) {
    logger.debug(
      `Skipping observation eval config fetch - no configs cached for project ${projectId}`,
    );

    return [];
  }

  // Fetch configs from database
  const configs = await prisma.jobConfiguration.findMany({
    where: {
      projectId,
      filterTarget: "observation",
      status: "ACTIVE",
    },
    select: {
      id: true,
      projectId: true,
      filter: true,
      sampling: true,
      evalTemplateId: true,
      scoreName: true,
      targetObject: true,
      variableMapping: true,
      delay: true,
    },
  });

  // Cache if no configs found
  if (configs.length === 0) {
    logger.debug(
      `No observation eval configs found for project ${projectId}, caching`,
    );
    await setNoObservationEvalConfigsCache(projectId);

    return [];
  }

  logger.debug(
    `Found ${configs.length} observation eval configs for project ${projectId}`,
  );

  return configs as ObservationEvalConfig[];
}
