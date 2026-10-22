import { JobConfigState, prisma, type Prisma } from "../../db";
import {
  EvalTargetObject,
  TopicsTargetObject,
} from "../../features/evals/types";
import { logger } from "../logger";
import { redis } from "../redis/redis";
import { isTopicsProjectEnabled } from "./config";

// Saves and pauses delete the key; the TTL bounds a missed delete or a fill
// that read Postgres before a concurrent save committed.
const CACHE_TTL_SECONDS = 300;
// Ingestion awaits this lookup, so a slow or unreachable Postgres must not hold it.
const LOOKUP_TIMEOUT_MS = 2_000;
// After a failed lookup the allowlist answer is cached briefly, so an outage
// costs one slow lookup per project per window instead of one per batch.
const FAILURE_TTL_SECONDS = 30;
const CACHE_KEY_PREFIX = "langfuse:topics:processing-active";

const cacheKey = (projectId: string) => `${CACHE_KEY_PREFIX}:${projectId}`;

/** The project's Topics rule: a transcript rule whose evaluators are all facets. */
export function topicRuleWhere(
  projectId: string,
): Prisma.EvaluationRuleWhereInput {
  return {
    projectId,
    targetObject: { in: [EvalTargetObject.TRACE, TopicsTargetObject] },
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
 * are cached in Redis. A failed or timed-out lookup caches the allowlist answer
 * briefly and propagates.
 */
export async function isTopicsProcessingActive(
  projectId: string,
): Promise<boolean> {
  if (!isTopicsProjectEnabled(projectId)) return false;
  const cached = await readCache(projectId);
  if (cached !== null) return cached;
  let active: boolean;
  try {
    active = await withTimeout(lookupProcessingActive(projectId));
  } catch (error) {
    await writeCache(projectId, true, FAILURE_TTL_SECONDS);
    throw error;
  }
  await writeCache(projectId, active, CACHE_TTL_SECONDS);
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

async function lookupProcessingActive(projectId: string): Promise<boolean> {
  const [config, rule] = await Promise.all([
    findActiveTopicsConfig(projectId),
    findActiveTopicRule(projectId),
  ]);
  return Boolean(config && rule);
}

function findActiveTopicsConfig(projectId: string) {
  return prisma.topicConfig.findFirst({
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
  });
}

function findActiveTopicRule(projectId: string) {
  return prisma.evaluationRule.findFirst({
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
  });
}

async function withTimeout<T>(lookup: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("Topics processing state lookup timed out")),
      LOOKUP_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([lookup, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

async function writeCache(
  projectId: string,
  active: boolean,
  ttlSeconds: number,
): Promise<void> {
  try {
    await redis?.set(cacheKey(projectId), active ? "1" : "0", "EX", ttlSeconds);
  } catch (error) {
    logger.warn("Failed to cache Topics processing state", {
      projectId,
      error,
    });
  }
}
