import useLocalStorage from "@/src/components/useLocalStorage";
import {
  type TimeRange,
  toAbsoluteTimeRange,
} from "@/src/utils/date-range-utils";
import { api } from "@/src/utils/api";
import { useMemo, useEffect } from "react";

const ENVIRONMENT_OPTIONS_CACHE_STORAGE_KEY =
  "langfuse-environment-options-cache-v1";

const SECOND_MS = 1000;
const MINUTE_MS = 60 * 1000;
const HALF_HOUR_MS = 30 * MINUTE_MS;
const DAY_MS = 24 * 60 * 60 * 1000;

const TTL_30_MINUTES_MS = 30 * SECOND_MS;
const TTL_1_DAY_MS = 5 * MINUTE_MS;
const TTL_7_DAYS_MS = 10 * MINUTE_MS;
const TTL_30_DAYS_MS = 30 * MINUTE_MS;
const TTL_LONG_MS = 60 * MINUTE_MS;

type EnvironmentOptionsCacheEntry = {
  options: string[];
  fetchedAt: number;
  expiresAt: number;
};

type EnvironmentOptionsCacheStore = Record<
  string,
  EnvironmentOptionsCacheEntry
>;

const getCacheBucketFromTimeRange = (timeRange: TimeRange) => {
  if ("range" in timeRange) return `relative:${timeRange.range}`;

  return `absolute:${timeRange.from.getTime()}:${timeRange.to.getTime()}`;
};

const getTtlMsFromTimeRange = (timeRange: TimeRange) => {
  const absoluteTimeRange = toAbsoluteTimeRange(timeRange);
  if (!absoluteTimeRange) return TTL_LONG_MS;

  const durationMs =
    absoluteTimeRange.to.getTime() - absoluteTimeRange.from.getTime();

  if (durationMs <= HALF_HOUR_MS) return TTL_30_MINUTES_MS;
  if (durationMs <= DAY_MS) return TTL_1_DAY_MS;
  if (durationMs <= 7 * DAY_MS) return TTL_7_DAYS_MS;
  if (durationMs <= 30 * DAY_MS) return TTL_30_DAYS_MS;
  return TTL_LONG_MS;
};

const pruneExpiredEntries = (
  store: EnvironmentOptionsCacheStore,
  now: number,
) => {
  return Object.fromEntries(
    Object.entries(store).filter(([, value]) => value.expiresAt > now),
  ) as EnvironmentOptionsCacheStore;
};

const dedupeOptions = (options: string[]) => Array.from(new Set(options));

export function useEnvironmentFilterOptionsCache({
  projectId,
  timeRange,
}: {
  projectId: string;
  timeRange: TimeRange;
}) {
  const absoluteTimeRange = useMemo(
    () => toAbsoluteTimeRange(timeRange) ?? undefined,
    [timeRange],
  );
  const cacheBucket = getCacheBucketFromTimeRange(timeRange);
  const ttlMs = getTtlMsFromTimeRange(timeRange);

  const cacheEntryKey = `${projectId}:${cacheBucket}`;
  const [cacheStore, setCacheStore] =
    useLocalStorage<EnvironmentOptionsCacheStore>(
      ENVIRONMENT_OPTIONS_CACHE_STORAGE_KEY,
      {},
    );

  const prunedCacheStore = useMemo(
    () => pruneExpiredEntries(cacheStore, Date.now()),
    [cacheStore],
  );
  const cacheEntry = prunedCacheStore[cacheEntryKey];
  const hasValidCache = Boolean(
    cacheEntry && cacheEntry.expiresAt > Date.now(),
  );

  // Persist cache cleanup to localStorage when needed.
  useEffect(() => {
    if (
      Object.keys(prunedCacheStore).length !== Object.keys(cacheStore).length
    ) {
      setCacheStore(prunedCacheStore);
    }
  }, [cacheStore, prunedCacheStore, setCacheStore]);

  const environmentFilterOptions =
    api.projects.environmentFilterOptions.useQuery(
      {
        projectId,
        fromTimestamp: absoluteTimeRange?.from,
      },
      {
        enabled: Boolean(projectId) && !hasValidCache,
        trpc: {
          context: {
            skipBatch: true,
          },
        },
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: ttlMs,
      },
    );

  useEffect(() => {
    if (!projectId || !environmentFilterOptions.data) return;

    const options = dedupeOptions(
      environmentFilterOptions.data.map((value) => value.environment),
    );
    const nextEntry: EnvironmentOptionsCacheEntry = {
      options,
      fetchedAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
    };

    setCacheStore((previousStore) => {
      const nextStore = pruneExpiredEntries(previousStore, Date.now());
      nextStore[cacheEntryKey] = nextEntry;
      return nextStore;
    });
  }, [
    projectId,
    cacheEntryKey,
    environmentFilterOptions.data,
    ttlMs,
    setCacheStore,
  ]);

  const environmentOptions = useMemo(() => {
    if (hasValidCache && cacheEntry) return cacheEntry.options;

    return dedupeOptions(
      environmentFilterOptions.data?.map((value) => value.environment) ?? [],
    );
  }, [hasValidCache, cacheEntry, environmentFilterOptions.data]);

  return {
    environmentOptions,
    isPending: !hasValidCache && environmentFilterOptions.isPending,
    isReady:
      hasValidCache ||
      environmentFilterOptions.isSuccess ||
      environmentFilterOptions.isError,
  };
}
