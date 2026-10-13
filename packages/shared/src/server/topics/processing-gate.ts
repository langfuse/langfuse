import { JobConfigState, prisma, type Prisma } from "../../db";
import { EvalTargetObject } from "../../features/evals/types";
import { logger } from "../logger";
import { redis } from "../redis/redis";
import { isTopicsProjectEnabled } from "./config";

// Saves and pauses delete the key; the TTL bounds a missed delete or a fill
// that read Postgres before a concurrent save committed.
const CACHE_TTL_SECONDS = 300;
const CACHE_KEY_PREFIX = "langfuse:topics:processing-active";

const cacheKey = (projectId: string) => `${CACHE_KEY_PREFIX}:${projectId}`;

/** The project's Topics rule: a trace rule whose evaluators are all facets. */
export function topicRuleWhere(
  projectId: string,
): Prisma.EvaluationRuleWhereInput {
  return {
    projectId,
    targetObject: EvalTargetObject.TRACE,
    assignments: {
      some: {},
      every: { projectId, evaluator: { projectId, type: "FACET" } },
    },
  };
}

/**
 * Whether new traces of the project enter trace-batch processing for Topics:
 * the project is allowlisted, Topics is on with all three models configured,
 * and an active rule runs at least one facet that is not blocked. Both answers
 * are cached in Redis; Postgres errors propagate.
 */
export async function isTopicsProcessingActive(
  projectId: string,
): Promise<boolean> {
  if (!isTopicsProjectEnabled(projectId)) return false;
  const cached = await readCache(projectId);
  if (cached !== null) return cached;

  const [config, rule] = await Promise.all([
    prisma.topicConfig.findFirst({
      where: {
        projectId,
        enabled: true,
        summaryLlmApiKeyId: { not: null },
        summaryModel: { not: null },
        embeddingLlmApiKeyId: { not: null },
        embeddingModel: { not: null },
        clusteringLlmApiKeyId: { not: null },
        clusteringModel: { not: null },
      },
      select: { id: true },
    }),
    prisma.evaluationRule.findFirst({
      where: {
        AND: [
          topicRuleWhere(projectId),
          {
            status: JobConfigState.ACTIVE,
            assignments: {
              some: { evaluator: { type: "FACET", blockedAt: null } },
            },
          },
        ],
      },
      select: { id: true },
    }),
  ]);
  const active = Boolean(config && rule);
  try {
    await redis?.set(
      cacheKey(projectId),
      active ? "1" : "0",
      "EX",
      CACHE_TTL_SECONDS,
    );
  } catch (error) {
    logger.warn("Failed to cache Topics processing state", {
      projectId,
      error,
    });
  }
  return active;
}

/** Call after a committed change to the project's Topics config or rule. */
export async function invalidateTopicsProcessingActive(
  projectId: string,
): Promise<void> {
  try {
    await redis?.del(cacheKey(projectId));
  } catch (error) {
    logger.warn("Failed to invalidate Topics processing state", {
      projectId,
      error,
    });
  }
}

async function readCache(projectId: string): Promise<boolean | null> {
  try {
    const cached = await redis?.get(cacheKey(projectId));
    if (cached === "1") return true;
    if (cached === "0") return false;
    return null;
  } catch (error) {
    logger.warn("Failed to read cached Topics processing state", {
      projectId,
      error,
    });
    return null;
  }
}
