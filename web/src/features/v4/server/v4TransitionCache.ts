import { z } from "zod/v4";
import {
  logger,
  redis,
  safeMultiGet,
  v4ExperimentPostUsageBlobSchema,
  v4ExperimentPostUsageProjectKey,
  v4LegacyApiUsageBlobSchema,
  v4LegacyApiUsageProjectKey,
  type V4ExperimentPostUsageBlob,
  type V4LegacyApiUsageBlob,
  type V4LegacyApiUsageRow,
} from "@langfuse/shared/src/server";

/**
 * Redis caching for the v4 transition usage checks.
 *
 * SDK ingestion is read from the indexed `events_core` table. A per-project
 * blob covers the detection window up to an hour-aligned `hotStart` boundary;
 * readers always query the small `[hotStart, now]` gap live and merge it with
 * the blob so new SDK versions register within minutes. The TTL is one hour so
 * left-edge overcount on the sliding 3-day window (and stale classification
 * fields embedded in the blob) stay bounded to ~1h.
 *
 * Deprecated public API and experiment POST usage are maintained by the
 * worker pipeline into the shared Redis keys; the request path only reads
 * those entries (miss = no usage). Sidebar and panel SDK reads share this
 * blob + gap-fill path so both stay consistent.
 *
 * Helpers degrade gracefully: no Redis, Redis errors, or unparsable entries
 * behave like cache misses and never fail the request.
 */

/** Customer-ingress sources. Historical and experiment materializations are excluded. */
export const MIGRATION_INGRESS_EVENT_SOURCES = [
  "ingestion-api-dual-write",
  "otel-dual-write",
  "otel",
] as const;

/** Historical blob TTL: 60 minutes (1 hour). */
const SDK_USAGE_CACHE_TTL_SECONDS = 60 * 60;
const sdkUsageSeriesSchema = z.object({
  source: z.enum(MIGRATION_INGRESS_EVENT_SOURCES),
  ingestionPath: z.enum(["otel", "ingestion_api"]),
  deliveryMode: z.enum(["realtime", "delayed"]),
  sdkName: z.string(),
  sdkVersion: z.string(),
  canonicalSdkName: z.enum(["python", "javascript"]).nullable(),
  sdkVersionMajor: z.number().nullable(),
  latestSdkMajor: z.number().nullable(),
  isValidSdkVersion: z.boolean(),
  attributionStatus: z.enum([
    "attributed",
    "missing_name",
    "missing_version",
    "missing_name_and_version",
  ]),
  publicKey: z.string(),
  v4MigrationStatus: z.enum(["compatible", "upgrade_required", "unknown"]),
  remediationType: z.enum([
    "update_sdk",
    "update_otel_instrumentation",
    "upgrade_instrumentation",
  ]),
  actionLevel: z.enum(["required", "none"]),
  eventCount: z.number(),
  firstSeen: z.string(),
  lastSeen: z.string(),
});

export type CachedSdkUsageSeries = z.infer<typeof sdkUsageSeriesSchema>;

const sdkUsageBlobSchema = z.object({
  version: z.literal(1),
  computedAt: z.string(),
  /** Hour-aligned ISO timestamp; the blob covers events strictly before it. */
  hotStart: z.string(),
  series: z.array(sdkUsageSeriesSchema),
});

export type SdkUsageCacheBlob = z.infer<typeof sdkUsageBlobSchema>;

export type CachedLegacyApiUsageRow = V4LegacyApiUsageRow;
export type LegacyApiUsageCacheBlob = V4LegacyApiUsageBlob;
export type ExperimentPostUsageCacheBlob = V4ExperimentPostUsageBlob;

const sdkUsageKey = (projectId: string) =>
  `langfuse:v4:sdk-usage:v1:${projectId}`;
const legacyApiUsageKey = v4LegacyApiUsageProjectKey;
const experimentPostUsageKey = v4ExperimentPostUsageProjectKey;

export const isV4TransitionCacheAvailable = (): boolean =>
  redis != null && redis.status !== "end" && redis.status !== "close";

const readBlobs = async <T>(
  keys: string[],
  schema: z.ZodType<T>,
): Promise<(T | null)[]> => {
  if (!isV4TransitionCacheAvailable() || keys.length === 0) {
    return keys.map(() => null);
  }
  try {
    // Cluster-safe: project keys hash to different slots.
    const rawValues = await safeMultiGet(redis, keys);
    return rawValues.map((rawValue) => {
      if (!rawValue) return null;
      try {
        const parsed = schema.safeParse(JSON.parse(rawValue));
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    });
  } catch (error) {
    logger.warn("Failed to read v4 transition cache from Redis", { error });
    return keys.map(() => null);
  }
};

const writeBlobs = async (
  entries: { key: string; ttlSeconds: number; value: unknown }[],
): Promise<void> => {
  if (!isV4TransitionCacheAvailable() || entries.length === 0) return;
  try {
    await Promise.all(
      entries.map((entry) =>
        redis!.setex(entry.key, entry.ttlSeconds, JSON.stringify(entry.value)),
      ),
    );
  } catch (error) {
    logger.warn("Failed to write v4 transition cache to Redis", { error });
  }
};

export const readSdkUsageCache = (
  projectIds: string[],
): Promise<(SdkUsageCacheBlob | null)[]> =>
  readBlobs(projectIds.map(sdkUsageKey), sdkUsageBlobSchema);

export const writeSdkUsageCache = (
  entries: {
    projectId: string;
    hotStart: Date;
    series: CachedSdkUsageSeries[];
  }[],
  now = new Date(),
): Promise<void> =>
  writeBlobs(
    entries.map((entry) => ({
      key: sdkUsageKey(entry.projectId),
      ttlSeconds: SDK_USAGE_CACHE_TTL_SECONDS,
      value: {
        version: 1,
        computedAt: now.toISOString(),
        hotStart: entry.hotStart.toISOString(),
        series: entry.series,
      } satisfies SdkUsageCacheBlob,
    })),
  );

export const readLegacyApiUsageCache = (
  projectIds: string[],
): Promise<(LegacyApiUsageCacheBlob | null)[]> =>
  readBlobs(projectIds.map(legacyApiUsageKey), v4LegacyApiUsageBlobSchema);

export const readExperimentPostUsageCache = (
  projectIds: string[],
): Promise<(ExperimentPostUsageCacheBlob | null)[]> =>
  readBlobs(
    projectIds.map(experimentPostUsageKey),
    v4ExperimentPostUsageBlobSchema,
  );

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** Trailing detection window used for SDK cache blobs and usage queries. */
export const V4_TRANSITION_DETECTION_WINDOW_MS = 3 * 24 * HOUR_MS;

/**
 * Detection windows are computed server-side so cache entries are shared
 * across requesters and long-lived tabs cannot pin stale ranges.
 */
export const getV4TransitionDetectionWindow = (nowMs = Date.now()) => {
  const hotStart = new Date(Math.floor(nowMs / HOUR_MS) * HOUR_MS);
  const windowEnd = new Date(hotStart.getTime() + HOUR_MS);
  return {
    /** Start of the current hour; cached SDK blobs cover strictly before it. */
    hotStart,
    windowEnd,
    windowStart: new Date(
      windowEnd.getTime() - V4_TRANSITION_DETECTION_WINDOW_MS,
    ),
    /**
     * Upper bound for the live SDK `events_core` gap query, floored to the
     * current minute. Every request within the same minute sees the identical
     * boundary, so the rendered ClickHouse datetime literal (and thus the whole
     * query AST) is stable and can hit the ClickHouse query result cache.
     * Events after the cutoff surface on the next minute; there is no permanent
     * gap. Minute (not hour) alignment keeps freshness at ~1 minute.
     */
    recentCutoff: new Date(Math.floor(nowMs / MINUTE_MS) * MINUTE_MS),
  };
};
