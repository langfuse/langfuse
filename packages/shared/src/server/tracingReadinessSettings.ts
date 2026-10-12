import { z } from "zod";
import { prisma } from "../db";
import { logger } from "./logger";
import { redis } from "./redis/redis";

// The minimum stays at least 2x the 30 s dispatch interval so event batches of
// one trace are not dispatched separately. The maximum stays below the 2 h
// pending TTL, after which idle traces are dropped before dispatch. The DB does
// not enforce these, so every write goes through this schema.
export const TRACE_IDLE_MS_MIN = 60_000;
export const TRACE_IDLE_MS_MAX = 3_600_000;

// Reads are served from Redis for up to this long. Saving deletes the entry, so
// only a failed delete leaves a stale value, until the entry expires.
const CACHE_TTL_SECONDS = 300;
const CACHE_KEY_PREFIX = "langfuse:tracing-readiness-settings";

export const tracingReadinessSettingsSchema = z.object({
  traceIdleMs: z
    .number()
    .int()
    .min(TRACE_IDLE_MS_MIN)
    .max(TRACE_IDLE_MS_MAX)
    .nullable(),
});

export type TracingReadinessSettings = z.infer<
  typeof tracingReadinessSettingsSchema
>;

const cacheKey = (projectId: string) => `${CACHE_KEY_PREFIX}:${projectId}`;

/**
 * Null fields mean the deployment default; a project without a row has all
 * nulls. Served from Redis when cached; Postgres errors propagate.
 */
export async function getTracingReadinessSettings(
  projectId: string,
): Promise<TracingReadinessSettings> {
  const cached = await readCache(projectId);
  if (cached) return cached;

  const row = await prisma.tracingReadinessSettings.findUnique({
    where: { projectId },
    select: { traceIdleMs: true },
  });
  const settings = { traceIdleMs: row?.traceIdleMs ?? null };
  try {
    await redis?.set(
      cacheKey(projectId),
      JSON.stringify(settings),
      "EX",
      CACHE_TTL_SECONDS,
    );
  } catch (error) {
    logger.warn("Failed to cache tracing readiness settings", {
      projectId,
      error,
    });
  }
  return settings;
}

export async function saveTracingReadinessSettings(
  projectId: string,
  settings: TracingReadinessSettings,
  { userId = null }: { userId?: string | null } = {},
): Promise<TracingReadinessSettings> {
  const data = tracingReadinessSettingsSchema.parse(settings);
  const row = await prisma.tracingReadinessSettings.upsert({
    where: { projectId },
    create: { projectId, ...data, createdBy: userId, updatedBy: userId },
    update: { ...data, updatedBy: userId },
    select: { traceIdleMs: true },
  });
  try {
    await redis?.del(cacheKey(projectId));
  } catch (error) {
    logger.warn("Failed to clear cached tracing readiness settings", {
      projectId,
      error,
    });
  }
  return { traceIdleMs: row.traceIdleMs };
}

async function readCache(
  projectId: string,
): Promise<TracingReadinessSettings | null> {
  try {
    const cached = await redis?.get(cacheKey(projectId));
    if (!cached) return null;
    const parsed = tracingReadinessSettingsSchema.safeParse(JSON.parse(cached));
    return parsed.success ? parsed.data : null;
  } catch (error) {
    logger.warn("Failed to read cached tracing readiness settings", {
      projectId,
      error,
    });
    return null;
  }
}
