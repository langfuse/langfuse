import {
  logger,
  recordGauge,
  redis,
  V4_LEGACY_API_USAGE_HEARTBEAT_KEY,
} from "@langfuse/shared/src/server";

/**
 * Freshness metric for the v4 legacy API usage pipeline.
 *
 * A single gauge is enough to alert on staleness: the worker only refreshes
 * the heartbeat after a fully successful run, so a stuck, failing, or missing
 * job lets `heartbeat_age_seconds` climb past the freshness window. Emitted
 * from QueueMetricsRunner so age keeps rising between the 15-minute job runs.
 *
 * Alert: `avg:langfuse.v4.legacy_api_usage.heartbeat_age_seconds > 10800` (3h).
 */
export const V4_LEGACY_API_USAGE_HEARTBEAT_AGE_METRIC =
  "langfuse.v4.legacy_api_usage.heartbeat_age_seconds";

export const emitV4LegacyApiUsageFreshnessMetrics = async (
  nowMs = Date.now(),
): Promise<void> => {
  if (!redis) return;

  const heartbeatIso = await redis.get(V4_LEGACY_API_USAGE_HEARTBEAT_KEY);
  const heartbeatMs = heartbeatIso ? Date.parse(heartbeatIso) : NaN;
  // Missing/unparsable heartbeat (never ran) surfaces as a no-data alert; the
  // key's 15d TTL means a running pipeline always has a value to age off.
  if (!Number.isFinite(heartbeatMs)) return;

  try {
    recordGauge(
      V4_LEGACY_API_USAGE_HEARTBEAT_AGE_METRIC,
      Math.max(0, Math.floor((nowMs - heartbeatMs) / 1000)),
      { unit: "seconds" },
    );
  } catch (error) {
    logger.error(
      "v4 legacy API usage: failed to emit heartbeat freshness metric",
      error,
    );
  }
};
