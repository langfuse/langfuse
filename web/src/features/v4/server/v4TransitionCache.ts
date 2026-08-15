import { z } from "zod/v4";
import { logger, redis } from "@langfuse/shared/src/server";

/**
 * Redis caching for the v4 transition usage checks.
 *
 * The v4 sidebar/panel checks read two expensive ClickHouse sources: SDK
 * ingestion from `events_core` and deprecated public API usage from
 * `system.query_log`. Uncached, always-mounted UI repeating these scans
 * saturated ClickHouse, so results are cached per project:
 *
 * - SDK usage: a per-project blob covering the detection window up to an
 *   hour-aligned `hotStart` boundary. Readers always query the small
 *   `[hotStart, now]` gap live from the indexed `events_core` table and merge
 *   it with the blob, so freshness never depends on the TTL. The TTL is
 *   bounded to a day because cached rows embed classification verdicts
 *   (e.g. `latestSdkMajor`) that must re-apply within a day of a rules
 *   change.
 * - Legacy API usage and experiment POST usage: raw per-project facts from
 *   `system.query_log`, which is unindexed for our filters, fans out across
 *   replicas, and is delayed at the source anyway. Cached for 12h; the
 *   cache-only sidebar reads never fall back to ClickHouse.
 *
 * All helpers degrade gracefully: no Redis, Redis errors, or unparsable
 * entries behave like cache misses and never fail the request.
 */

/** Customer-ingress sources. Historical and experiment materializations are excluded. */
export const MIGRATION_INGRESS_EVENT_SOURCES = [
  "ingestion-api-dual-write",
  "otel-dual-write",
  "otel",
] as const;

export const SDK_USAGE_CACHE_TTL_SECONDS = 24 * 60 * 60;
/**
 * Blobs older than this force a refill: the live gap query spans
 * `[blob.hotStart, now]`, so past this age it would approach the full
 * detection window and the cache would save nothing.
 */
export const SDK_USAGE_CACHE_MAX_AGE_MS = 25 * 60 * 60 * 1000;
export const LEGACY_API_CACHE_TTL_SECONDS = 12 * 60 * 60;
export const EXPERIMENT_POST_CACHE_TTL_SECONDS = 12 * 60 * 60;

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

const legacyApiUsageRowSchema = z.object({
  entrypoint: z.string(),
  count: z.number(),
  lastSeen: z.string(),
});

export type CachedLegacyApiUsageRow = z.infer<typeof legacyApiUsageRowSchema>;

const legacyApiUsageBlobSchema = z.object({
  version: z.literal(1),
  computedAt: z.string(),
  rows: z.array(legacyApiUsageRowSchema),
});

export type LegacyApiUsageCacheBlob = z.infer<typeof legacyApiUsageBlobSchema>;

const experimentPostUsageBlobSchema = z.object({
  version: z.literal(1),
  computedAt: z.string(),
  used: z.boolean(),
});

export type ExperimentPostUsageCacheBlob = z.infer<
  typeof experimentPostUsageBlobSchema
>;

// v2: entries derived from the 14-day detection window. The version segment
// exists so window/semantics changes invalidate old entries instead of being
// silently served under new semantics.
const sdkUsageKey = (projectId: string) =>
  `langfuse:v4:sdk-usage:v2:${projectId}`;
const legacyApiUsageKey = (projectId: string) =>
  `langfuse:v4:legacy-api-usage:v2:${projectId}`;
const experimentPostUsageKey = (projectId: string) =>
  `langfuse:v4:experiment-post-usage:v2:${projectId}`;

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
    const rawValues = await redis!.mget(keys);
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
  readBlobs(projectIds.map(legacyApiUsageKey), legacyApiUsageBlobSchema);

export const writeLegacyApiUsageCache = (
  entries: { projectId: string; rows: CachedLegacyApiUsageRow[] }[],
  now = new Date(),
): Promise<void> =>
  writeBlobs(
    entries.map((entry) => ({
      key: legacyApiUsageKey(entry.projectId),
      ttlSeconds: LEGACY_API_CACHE_TTL_SECONDS,
      value: {
        version: 1,
        computedAt: now.toISOString(),
        rows: entry.rows,
      } satisfies LegacyApiUsageCacheBlob,
    })),
  );

export const readExperimentPostUsageCache = (
  projectIds: string[],
): Promise<(ExperimentPostUsageCacheBlob | null)[]> =>
  readBlobs(
    projectIds.map(experimentPostUsageKey),
    experimentPostUsageBlobSchema,
  );

export const writeExperimentPostUsageCache = (
  entries: { projectId: string; used: boolean }[],
  now = new Date(),
): Promise<void> =>
  writeBlobs(
    entries.map((entry) => ({
      key: experimentPostUsageKey(entry.projectId),
      ttlSeconds: EXPERIMENT_POST_CACHE_TTL_SECONDS,
      value: {
        version: 1,
        computedAt: now.toISOString(),
        used: entry.used,
      } satisfies ExperimentPostUsageCacheBlob,
    })),
  );
