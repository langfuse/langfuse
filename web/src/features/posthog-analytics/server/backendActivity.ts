import { logger, redis } from "@langfuse/shared/src/server";

import { env } from "@/src/env.mjs";
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
  const localCache = new Map<string, number>();

  const isCachedLocally = (key: string, timestamp: Date) => {
    const expiresAt = localCache.get(key);
    if (expiresAt === undefined) return false;

    if (timestamp.getTime() >= expiresAt) {
      localCache.delete(key);
      return false;
    }

    return true;
  };

  const cacheLocally = (key: string, timestamp: Date) => {
    if (localCache.size >= LOCAL_CACHE_MAX_ENTRIES) {
      const oldestKey = localCache.keys().next().value;
      if (oldestKey) localCache.delete(oldestKey);
    }
    localCache.set(
      key,
      timestamp.getTime() + DEDUPLICATION_TTL_SECONDS * 1_000,
    );
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
    // Keep the existing key format so old and new web instances share the
    // Redis lock during rolling deployments. The TTL owns the cache window.
    const utcDate = timestamp.toISOString().slice(0, 10);
    const deduplicationKey = [
      "langfuse",
      "backend-activity",
      utcDate,
      userId,
      activityScope,
      scopeId,
    ].join(":");

    if (isCachedLocally(deduplicationKey, timestamp)) return;
    // Mark the attempt before the first await so concurrent requests and Redis
    // outages cannot create an analytics retry storm in this web process.
    cacheLocally(deduplicationKey, timestamp);

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
  cloudRegion:
    env.NODE_ENV === "production"
      ? env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION
      : undefined,
  now: () => new Date(),
  setIfAbsent: async (key, ttlSeconds) => {
    if (!redis) return false;
    return (await redis.set(key, "1", "EX", ttlSeconds, "NX")) === "OK";
  },
});
