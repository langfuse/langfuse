import { JobConfigState, prisma } from "../../db";
import { TRACE_TRANSCRIPT_EVAL_TYPES } from "../../features/evals/traceTranscriptEval";
import { TopicsTargetObject } from "../../features/evals/types";
import { logger } from "../logger";
import { redis } from "../redis/redis";
import { isTraceEvalsProjectEnabled } from "./traceEvalsConfig";

// Rule saves delete the key; the TTL bounds a missed delete or a fill
// that read Postgres before a concurrent save committed.
const CACHE_TTL_SECONDS = 300;
// Ingestion awaits this lookup, so a slow or unreachable Postgres must not hold it.
const LOOKUP_TIMEOUT_MS = 2_000;
// After a failed lookup the allowlist answer is cached briefly, so an outage
// costs one slow lookup per project per window instead of one per batch.
const FAILURE_TTL_SECONDS = 30;
const CACHE_KEY_PREFIX = "langfuse:trace-evals:processing-active";

const cacheKey = (projectId: string) => `${CACHE_KEY_PREFIX}:${projectId}`;

/**
 * The share of the project's new traces that enter trace-batch processing for
 * trace evals: the largest sampling rate of the active transcript rules that
 * run at least one judge or decision-model evaluator that is not blocked,
 * when the project is allowlisted; otherwise 0. The answer is cached in
 * Redis. A failed or timed-out lookup caches the allowlist answer (1) briefly
 * and propagates.
 */
export async function getTraceEvalsProcessingSampling(
  projectId: string,
): Promise<number> {
  if (!isTraceEvalsProjectEnabled(projectId)) return 0;
  const cached = await readCache(projectId);
  if (cached !== null) return cached;
  let sampling: number;
  try {
    sampling = await withTimeout(lookupProcessingSampling(projectId));
  } catch (error) {
    await writeCache(projectId, 1, FAILURE_TTL_SECONDS);
    throw error;
  }
  await writeCache(projectId, sampling, CACHE_TTL_SECONDS);
  return sampling;
}

/** Whether any new traces of the project enter trace-batch processing for trace evals. */
export async function isTraceEvalsProcessingActive(
  projectId: string,
): Promise<boolean> {
  return (await getTraceEvalsProcessingSampling(projectId)) > 0;
}

/** Call after a committed change to the project's evaluation rules or evaluators. */
export async function invalidateTraceEvalsProcessingActive(
  projectId: string,
): Promise<void> {
  try {
    await redis?.del(cacheKey(projectId));
  } catch (error) {
    logger.warn("Failed to invalidate trace evals processing state", {
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
    logger.warn("Failed to read cached trace evals processing state", {
      projectId,
      error,
    });
    return null;
  }
}

async function lookupProcessingSampling(projectId: string): Promise<number> {
  const rules = await prisma.evaluationRule.findMany({
    where: {
      projectId,
      targetObject: TopicsTargetObject,
      status: JobConfigState.ACTIVE,
      assignments: {
        some: {
          projectId,
          evaluator: {
            projectId,
            blockedAt: null,
            type: { in: [...TRACE_TRANSCRIPT_EVAL_TYPES] },
          },
        },
      },
    },
    select: { sampling: true },
  });
  if (!rules.length) return 0;
  // Rules sample on the same deterministic trace-ID value, so the largest rate admits every rule's sample.
  const sampling = Math.max(...rules.map((rule) => Number(rule.sampling)));
  return Math.min(1, Math.max(0, sampling));
}

async function withTimeout<T>(lookup: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("Trace evals processing state lookup timed out")),
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
    logger.warn("Failed to cache trace evals processing state", {
      projectId,
      error,
    });
  }
}
