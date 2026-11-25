import { JobConfigState, prisma, type Prisma } from "../../db";
import { TopicsTargetObject } from "../../features/evals/types";
import { logger } from "../logger";
import { redis } from "../redis/redis";

// Saves and pauses delete the key; the TTL bounds a missed delete or a fill
// that read Postgres before a concurrent save committed.
const CACHE_TTL_SECONDS = 300;
// Ingestion awaits this lookup, so a slow or unreachable Postgres must not hold it.
const LOOKUP_TIMEOUT_MS = 2_000;
// After a failed lookup "nothing admitted" is cached briefly, so an outage
// costs one slow lookup per project per window instead of one per batch, and
// a Postgres outage cannot admit every project's traces at once.
const FAILURE_TTL_SECONDS = 30;
const CACHE_KEY_PREFIX = "langfuse:topics:processing-active";

const cacheKey = (projectId: string) => `${CACHE_KEY_PREFIX}:${projectId}`;

/** The project's Topics rule: a transcript rule whose evaluators are all facets. */
export function topicRuleWhere(
  projectId: string,
): Prisma.EvaluationRuleWhereInput {
  return {
    projectId,
    targetObject: TopicsTargetObject,
    assignments: {
      some: {},
      every: { projectId, evaluator: { projectId, type: "FACET" } },
    },
  };
}

/**
 * The share of the project's new traces that enter trace dispatch for
 * Topics. A project with automatic processing on and all three models configured
 * uses the largest sampling rate among active rules with an unblocked facet.
 * Other projects return 0. Redis caches the result. A failed or timed-out
 * lookup briefly caches 0 and propagates.
 */
export async function getTopicsProcessingSampling(
  projectId: string,
): Promise<number> {
  const cached = await readCache(projectId);
  if (cached !== null) return cached;
  let sampling: number;
  try {
    sampling = await withTimeout(lookupProcessingSampling(projectId));
  } catch (error) {
    await writeCache(projectId, 0, FAILURE_TTL_SECONDS);
    throw error;
  }
  await writeCache(projectId, sampling, CACHE_TTL_SECONDS);
  return sampling;
}

/** Whether any new traces of the project enter trace dispatch for Topics. */
export async function isTopicsProcessingActive(
  projectId: string,
): Promise<boolean> {
  return (await getTopicsProcessingSampling(projectId)) > 0;
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

async function readCache(projectId: string): Promise<number | null> {
  try {
    const cached = await redis?.get(cacheKey(projectId));
    const sampling =
      cached === null || cached === undefined ? NaN : Number(cached);
    return sampling >= 0 && sampling <= 1 ? sampling : null;
  } catch (error) {
    logger.warn("Failed to read cached Topics processing state", {
      projectId,
      error,
    });
    return null;
  }
}

async function lookupProcessingSampling(projectId: string): Promise<number> {
  const [config, rules] = await Promise.all([
    findActiveTopicsConfig(projectId),
    findActiveTopicRules(projectId),
  ]);
  if (!config || !rules.length) return 0;
  // Rules sample on the same deterministic trace-ID value, so the largest rate admits every rule's sample.
  const sampling = Math.max(...rules.map((rule) => Number(rule.sampling)));
  return Math.min(1, Math.max(0, sampling));
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

function findActiveTopicRules(projectId: string) {
  return prisma.evaluationRule.findMany({
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
    select: { id: true, sampling: true },
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
  sampling: number,
  ttlSeconds: number,
): Promise<void> {
  try {
    await redis?.set(cacheKey(projectId), String(sampling), "EX", ttlSeconds);
  } catch (error) {
    logger.warn("Failed to cache Topics processing state", {
      projectId,
      error,
    });
  }
}
