import {
  EvalTargetObject,
  JobConfigState,
  normalizeEvaluationRuleTarget,
  type FilterState,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  logger,
  hasNoEvalConfigsCache,
  setNoEvalConfigsCache,
} from "@langfuse/shared/src/server";
import { type ObservationEvalRule } from "./types";

/**
 * Fetches the runnable observation evaluation rules for a project.
 *
 * This runs per ingested observation, so it stays as narrow as possible:
 * inactive rules and blocked evaluators are excluded in SQL rather than
 * filtered in the scheduler, and evaluator versions are not joined at all —
 * dispatch only needs the evaluator's identity and type, and the executor
 * resolves the definition when it picks the job up.
 *
 * Uses a cache to avoid unnecessary database queries:
 * - If cached as "no rules", returns empty array immediately
 * - If cache miss, queries database and caches result if empty
 *
 * @param projectId - The project ID to fetch rules for
 * @returns Array of runnable evaluation rules (empty if none exist)
 */
export async function fetchObservationEvalRules(
  projectId: string,
): Promise<ObservationEvalRule[]> {
  // Check cache first
  const hasNoRules = await hasNoEvalConfigsCache(projectId, "eventBased");
  if (hasNoRules) {
    logger.debug(
      `Skipping observation eval rule fetch - no rules cached for project ${projectId}`,
    );

    return [];
  }

  const rules = await prisma.evaluationRule.findMany({
    where: {
      projectId,
      targetObject: {
        in: [EvalTargetObject.EVENT, EvalTargetObject.EXPERIMENT],
      },
      status: JobConfigState.ACTIVE,
      // A rule whose every evaluator is blocked schedules nothing, so it must
      // not keep the project out of the "no rules" cache below.
      assignments: { some: { projectId, evaluator: { blockedAt: null } } },
    },
    select: {
      id: true,
      projectId: true,
      filter: true,
      sampling: true,
      status: true,
      targetObject: true,
      assignments: {
        where: { projectId, evaluator: { blockedAt: null } },
        select: {
          id: true,
          evaluatorId: true,
          variableMapping: true,
          evaluator: {
            select: {
              id: true,
              projectId: true,
              type: true,
            },
          },
        },
      },
    },
  });

  // Cache if no rules found
  if (rules.length === 0) {
    logger.debug(
      `No observation eval rules found for project ${projectId}, caching`,
    );
    await setNoEvalConfigsCache(projectId, "eventBased");

    return [];
  }

  logger.debug(
    `Found ${rules.length} observation eval rules for project ${projectId}`,
  );

  // Canonicalize here so the scheduler only ever sees `event` rules: the
  // legacy `experiment` target is expressed as its root-span filter instead.
  return rules.map((rule) => {
    const normalized = normalizeEvaluationRuleTarget({
      targetObject: rule.targetObject as
        | typeof EvalTargetObject.EVENT
        | typeof EvalTargetObject.EXPERIMENT,
      filter: rule.filter as FilterState,
    });
    return {
      ...rule,
      ...normalized,
      ruleId: rule.id,
    };
  });
}
