import { logger, redis } from "@langfuse/shared/src/server";

import { env } from "@/src/env.mjs";
import { isProductAnalyticsAvailable } from "@/src/features/posthog-analytics/productAnalyticsAvailability";
import { ServerPosthog } from "@/src/features/posthog-analytics/ServerPosthog";

const BACKEND_ACTIVITY_EVENT = "backend:activity";
const DEDUPLICATION_TTL_SECONDS = 60 * 60;
const LOCAL_CACHE_MAX_ENTRIES = 100_000;

type BackendActivity = {
  userId: string;
  organizationId: string;
  projectId?: string;
};

type BackendActivityTrackerDependencies = {
  capture: ServerPosthog["capture"];
  cloudRegion?: string;
  now: () => Date;
  setIfAbsent: (key: string, ttlSeconds: number) => Promise<boolean>;
};

export const createBackendActivityTracker = ({
  capture,
  cloudRegion,
  now,
  setIfAbsent,
}: BackendActivityTrackerDependencies) => {
  const localCache = new Set<string>();

  const cacheLocally = (key: string) => {
    if (localCache.size >= LOCAL_CACHE_MAX_ENTRIES) {
      const oldestKey = localCache.values().next().value;
      if (oldestKey) localCache.delete(oldestKey);
    }
    localCache.add(key);
  };

  return async ({
    userId,
    organizationId,
    projectId,
  }: BackendActivity): Promise<void> => {
    if (!cloudRegion) return;

    const timestamp = now();
    const activityScope = projectId ? "project" : "organization";
    const scopeId = projectId ?? organizationId;
    const utcHour = timestamp.toISOString().slice(0, 13);
    const deduplicationKey = [
      "langfuse",
      "backend-activity",
      "v2",
      utcHour,
      userId,
      activityScope,
      scopeId,
    ].join(":");

    if (localCache.has(deduplicationKey)) return;
    // Mark the attempt before the first await so concurrent requests and Redis
    // outages cannot create an analytics retry storm in this web process.
    cacheLocally(deduplicationKey);

    try {
      const isFirstActivity = await setIfAbsent(
        deduplicationKey,
        DEDUPLICATION_TTL_SECONDS,
      );

      if (!isFirstActivity) return;

      capture({
        distinctId: userId,
        event: BACKEND_ACTIVITY_EVENT,
        properties: {
          activityScope,
          cloudRegion,
          organizationId,
          ...(projectId ? { projectId } : {}),
          userId,
        },
        timestamp,
        disableGeoip: true,
      });
    } catch (error) {
      // Product analytics must never make an authenticated API request fail.
      logger.warn("Failed to record backend activity", { error });
    }
  };
};

let serverPosthog: ServerPosthog | undefined;

export const recordBackendActivity = createBackendActivityTracker({
  capture: (event) => {
    serverPosthog ??= new ServerPosthog();
    serverPosthog.capture(event);
  },
  // No region means "not Langfuse Cloud" to the tracker, which is also the
  // right answer for a region that runs no product analytics: it then skips the
  // Redis deduplication write as well, not just the capture.
  cloudRegion:
    env.NODE_ENV === "production" && isProductAnalyticsAvailable()
      ? env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION
      : undefined,
  now: () => new Date(),
  setIfAbsent: async (key, ttlSeconds) => {
    if (!redis) return false;
    return (await redis.set(key, "1", "EX", ttlSeconds, "NX")) === "OK";
  },
});
