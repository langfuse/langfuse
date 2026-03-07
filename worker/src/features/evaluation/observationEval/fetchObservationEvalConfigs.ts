import { EvalTargetObject } from "@langfuse/shared";
import { Prisma, prisma } from "@langfuse/shared/src/db";
import {
  logger,
  hasNoEvalConfigsCache,
  setNoEvalConfigsCache,
} from "@langfuse/shared/src/server";
import { type ObservationEvalConfig } from "./types";

/**
 * Fetches executable observation eval configs for a project.
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
  const hasNoConfigs = await hasNoEvalConfigsCache(projectId, "eventBased");
  if (hasNoConfigs) {
    logger.debug(
      `Skipping observation eval config fetch - no configs cached for project ${projectId}`,
    );

    return [];
  }

  // Fetch configs from database
  const configs = await prisma.$queryRaw<ObservationEvalConfig[]>(Prisma.sql`
    SELECT
      id,
      project_id AS "projectId",
      filter,
      sampling,
      eval_template_id AS "evalTemplateId",
      score_name AS "scoreName",
      status::text AS status,
      blocked_at AS "blockedAt",
      target_object AS "targetObject",
      variable_mapping AS "variableMapping"
    FROM job_configurations
    WHERE project_id = ${projectId}
      AND target_object IN (${Prisma.join([
        EvalTargetObject.EVENT,
        EvalTargetObject.EXPERIMENT,
      ])})
      AND status::text = 'ACTIVE'
      AND blocked_at IS NULL
  `);

  // Cache if no configs found
  if (configs.length === 0) {
    logger.debug(
      `No observation eval configs found for project ${projectId}, caching`,
    );
    await setNoEvalConfigsCache(projectId, "eventBased");

    return [];
  }

  logger.debug(
    `Found ${configs.length} observation eval configs for project ${projectId}`,
  );

  return configs;
}
