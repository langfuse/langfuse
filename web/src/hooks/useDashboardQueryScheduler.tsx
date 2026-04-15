import {
  type TimeRange,
  toAbsoluteTimeRange,
} from "@/src/utils/date-range-utils";
import { api, type RouterInputs, type RouterOutputs } from "@/src/utils/api";
import { hashKey, useQuery, type UseQueryOptions } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useSSEDashboardQuery,
  type QueryProgress,
} from "@/src/hooks/useSSEDashboardQuery";

type SchedulerItemStatus = "queued" | "running" | "done";

type SchedulerItem = {
  id: string;
  priority: number;
  isEligible: boolean;
  runKey: string;
  status: SchedulerItemStatus;
};

export type DashboardQuerySchedulerApi = {
  register: (
    id: string,
    priority: number,
    isEligible?: boolean,
    runKey?: string,
  ) => void;
  unregister: (id: string) => void;
  canFetch: (id: string) => boolean;
  markDone: (id: string) => void;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;

export const getDashboardQuerySchedulerMaxConcurrent = (
  timeRange: TimeRange,
) => {
  const absoluteTimeRange = toAbsoluteTimeRange(timeRange);
  if (!absoluteTimeRange) return 5;

  const durationMs =
    absoluteTimeRange.to.getTime() - absoluteTimeRange.from.getTime();

  if (durationMs >= 90 * DAY_MS) return 2;
  if (durationMs >= 30 * DAY_MS) return 4;
  if (durationMs >= 7 * DAY_MS) return 6;
  if (durationMs >= DAY_MS) return 6;
  return 9;
};

const parseIsoDateMs = (value: unknown): number | null => {
  if (typeof value !== "string") return null;

  const parsedMs = Date.parse(value);
  if (Number.isNaN(parsedMs)) return null;

  return parsedMs;
};

export const useDashboardQueryScheduler = ({
  maxConcurrent,
  resetKey,
}: {
  maxConcurrent: number;
  resetKey?: string;
}): DashboardQuerySchedulerApi => {
  const itemsRef = useRef<Map<string, SchedulerItem>>(new Map());
  const [_version, setVersion] = useState(0);
  const previousResetKeyRef = useRef<string | undefined>(resetKey);

  const syncQueue = useCallback(() => {
    const items = itemsRef.current;
    let runningCount = 0;
    let changed = false;

    for (const item of items.values()) {
      if (item.status === "running") {
        runningCount += 1;
      }
    }

    const candidates = Array.from(items.values())
      .filter((item) => item.status === "queued" && item.isEligible)
      .sort((a, b) => a.priority - b.priority);

    for (const candidate of candidates) {
      if (runningCount >= maxConcurrent) break;
      candidate.status = "running";
      runningCount += 1;
      changed = true;
    }

    if (changed) {
      setVersion((value) => value + 1);
    }
  }, [maxConcurrent]);

  const register = useCallback(
    (
      id: string,
      priority: number,
      isEligible: boolean = true,
      runKey: string = id,
    ) => {
      const existingItem = itemsRef.current.get(id);

      if (!existingItem) {
        itemsRef.current.set(id, {
          id,
          priority,
          isEligible,
          runKey,
          status: "queued",
        });
        syncQueue();
        return;
      }

      const didRunKeyChange = existingItem.runKey !== runKey;
      const shouldRequeue = didRunKeyChange && existingItem.status === "done";
      const didChange =
        existingItem.priority !== priority ||
        existingItem.isEligible !== isEligible ||
        didRunKeyChange ||
        shouldRequeue;

      if (didChange) {
        existingItem.priority = priority;
        existingItem.isEligible = isEligible;
        existingItem.runKey = runKey;
        if (shouldRequeue) {
          existingItem.status = "queued";
        }
        setVersion((value) => value + 1);
      }

      syncQueue();
    },
    [syncQueue],
  );

  const unregister = useCallback(
    (id: string) => {
      const existing = itemsRef.current.get(id);
      if (!existing) return;

      itemsRef.current.delete(id);
      setVersion((value) => value + 1);

      if (existing.status === "running") {
        syncQueue();
      }
    },
    [syncQueue],
  );

  const markDone = useCallback(
    (id: string) => {
      const item = itemsRef.current.get(id);
      if (!item || item.status === "done") return;

      item.status = "done";
      setVersion((value) => value + 1);
      syncQueue();
    },
    [syncQueue],
  );

  const resetQueue = useCallback(() => {
    let changed = false;

    for (const item of itemsRef.current.values()) {
      if (item.status !== "queued") {
        item.status = "queued";
        changed = true;
      }
    }

    if (changed) {
      setVersion((value) => value + 1);
    }

    syncQueue();
  }, [syncQueue]);

  const canFetch = useCallback((id: string) => {
    const item = itemsRef.current.get(id);
    if (!item) return false;
    return item.status === "running";
  }, []);

  useEffect(() => {
    syncQueue();
  }, [maxConcurrent, syncQueue]);

  useEffect(() => {
    if (previousResetKeyRef.current === resetKey) return;
    previousResetKeyRef.current = resetKey;
    resetQueue();
  }, [resetKey, resetQueue]);

  return {
    register,
    unregister,
    canFetch,
    markDone,
  };
};

type DashboardQuerySchedulerContextValue = {
  scheduler: Pick<
    DashboardQuerySchedulerApi,
    "register" | "unregister" | "canFetch" | "markDone"
  >;
  shouldBucketQueriesByTimeRange: boolean;
};

const DashboardQuerySchedulerContext =
  createContext<DashboardQuerySchedulerContextValue | null>(null);

export const DashboardQuerySchedulerProvider = ({
  scheduler,
  shouldBucketQueriesByTimeRange = false,
  children,
}: {
  scheduler: DashboardQuerySchedulerContextValue["scheduler"];
  shouldBucketQueriesByTimeRange?: boolean;
  children: ReactNode;
}) => {
  const contextValue = useMemo(
    () => ({
      scheduler: {
        register: scheduler.register,
        unregister: scheduler.unregister,
        canFetch: scheduler.canFetch,
        markDone: scheduler.markDone,
      },
      shouldBucketQueriesByTimeRange,
    }),
    [
      scheduler.register,
      scheduler.unregister,
      scheduler.canFetch,
      scheduler.markDone,
      shouldBucketQueriesByTimeRange,
    ],
  );

  return (
    <DashboardQuerySchedulerContext.Provider value={contextValue}>
      {children}
    </DashboardQuerySchedulerContext.Provider>
  );
};

const useDashboardQuerySchedulerContext = () => {
  return useContext(DashboardQuerySchedulerContext);
};

type DashboardExecuteQueryInput = RouterInputs["dashboard"]["executeQuery"];
type DashboardExecuteQueryOutput = RouterOutputs["dashboard"]["executeQuery"];
type DashboardExecuteQueryOptions = Omit<
  UseQueryOptions<DashboardExecuteQueryOutput, Error>,
  "enabled" | "meta" | "queryFn" | "queryKey"
> & {
  meta?: Record<string, unknown>;
  trpc?: {
    context?: {
      skipBatch?: boolean;
    };
  };
};
type ScheduledDashboardExecuteQueryOptions = Omit<
  DashboardExecuteQueryOptions,
  "enabled" | "meta"
> & {
  enabled?: boolean;
  meta?: DashboardExecuteQueryOptions["meta"];
  priority?: number;
  queryId: string;
  refreshKey?: unknown;
  useSSE?: boolean;
};

const getDashboardExecuteQueryDurationMs = (
  input: DashboardExecuteQueryInput,
): number | null => {
  const fromMs = parseIsoDateMs(input.query?.fromTimestamp);
  const toMs = parseIsoDateMs(input.query?.toTimestamp);

  if (fromMs === null || toMs === null) return null;
  return Math.max(0, toMs - fromMs);
};

const getDashboardExecuteQueryCachePolicy = (
  input: DashboardExecuteQueryInput,
): {
  staleTime: number;
  gcTime: number;
} => {
  const durationMs = getDashboardExecuteQueryDurationMs(input);

  if (durationMs === null) {
    return {
      staleTime: 30 * SECOND_MS,
      gcTime: 10 * MINUTE_MS,
    };
  }

  if (durationMs <= 30 * MINUTE_MS) {
    return {
      staleTime: 15 * SECOND_MS,
      gcTime: 5 * MINUTE_MS,
    };
  }

  if (durationMs <= DAY_MS) {
    return {
      staleTime: 30 * SECOND_MS,
      gcTime: 10 * MINUTE_MS,
    };
  }

  if (durationMs <= 7 * DAY_MS) {
    return {
      staleTime: 2 * MINUTE_MS,
      gcTime: 20 * MINUTE_MS,
    };
  }

  if (durationMs <= 30 * DAY_MS) {
    return {
      staleTime: 5 * MINUTE_MS,
      gcTime: 30 * MINUTE_MS,
    };
  }

  return {
    staleTime: 10 * MINUTE_MS,
    gcTime: 60 * MINUTE_MS,
  };
};

const normalizeIsoTimestampByBucket = (
  value: unknown,
  bucketMs: number,
): unknown => {
  if (typeof value !== "string") return value;
  const parsedMs = Date.parse(value);
  if (Number.isNaN(parsedMs)) return value;

  const effectiveBucketMs = Math.max(1, Math.floor(bucketMs));
  const normalizedMs =
    Math.floor(parsedMs / effectiveBucketMs) * effectiveBucketMs;
  return new Date(normalizedMs).toISOString();
};

const normalizeDashboardExecuteQueryInputForCache = (
  input: DashboardExecuteQueryInput,
  bucketMs: number,
): DashboardExecuteQueryInput => {
  if (!input.query) return input;

  // Intentionally bucket from/to timestamps only for derived cache/restart keys.
  // The backend payload still uses the original timestamps.
  return {
    ...input,
    query: {
      ...input.query,
      fromTimestamp: normalizeIsoTimestampByBucket(
        input.query.fromTimestamp,
        bucketMs,
      ) as string,
      toTimestamp: normalizeIsoTimestampByBucket(
        input.query.toTimestamp,
        bucketMs,
      ) as string,
    },
  };
};

export const useScheduledDashboardExecuteQuery = (
  input: DashboardExecuteQueryInput,
  {
    enabled = true,
    meta,
    priority = 1000,
    queryId,
    refreshKey,
    useSSE = false,
    ...queryOptions
  }: ScheduledDashboardExecuteQueryOptions,
): {
  data: Record<string, unknown>[] | undefined;
  isLoading: boolean;
  isError: boolean;
  isSuccess: boolean;
  fetchStatus: string;
  isPending: boolean;
  progress: QueryProgress | null;
  error: string | null;
} => {
  const context = useDashboardQuerySchedulerContext();
  const utils = api.useUtils();
  const scheduler = context?.scheduler;
  const register = scheduler?.register;
  const unregister = scheduler?.unregister;
  const markDone = scheduler?.markDone;
  const shouldBucketQueriesByTimeRange =
    context?.shouldBucketQueriesByTimeRange ?? false;
  const cachePolicy = useMemo(
    () => getDashboardExecuteQueryCachePolicy(input),
    [input],
  );
  const cacheKeyInput = useMemo(
    () =>
      shouldBucketQueriesByTimeRange
        ? normalizeDashboardExecuteQueryInputForCache(
            input,
            cachePolicy.staleTime,
          )
        : input,
    [cachePolicy.staleTime, input, shouldBucketQueriesByTimeRange],
  );
  const queryCacheKey = useMemo(
    () => ["dashboard.executeQuery", cacheKeyInput, refreshKey ?? null],
    [cacheKeyInput, refreshKey],
  );
  const effectiveRunKey = useMemo(
    () => hashKey(queryCacheKey),
    [queryCacheKey],
  );
  const { trpc, ...reactQueryOptions } = queryOptions;

  useEffect(() => {
    if (!unregister) return;
    return () => {
      unregister(queryId);
    };
  }, [queryId, unregister]);

  useEffect(() => {
    if (!register) return;
    register(queryId, priority, enabled, effectiveRunKey);
  }, [effectiveRunKey, enabled, priority, queryId, register]);

  const canFetch = scheduler ? scheduler.canFetch(queryId) : true;

  // tRPC path (default)
  const trpcResult = useQuery<DashboardExecuteQueryOutput, Error>({
    ...reactQueryOptions,
    queryKey: queryCacheKey,
    queryFn: async () =>
      utils.dashboard.executeQuery.fetch(input, {
        trpc,
      }),
    staleTime: queryOptions.staleTime ?? cachePolicy.staleTime,
    gcTime: queryOptions.gcTime ?? cachePolicy.gcTime,
    refetchOnWindowFocus: queryOptions.refetchOnWindowFocus ?? false,
    refetchOnReconnect: queryOptions.refetchOnReconnect ?? false,
    refetchOnMount: queryOptions.refetchOnMount ?? false,
    enabled: enabled && canFetch && !useSSE,
    meta,
  });

  // SSE path (opt-in)
  const sseResult = useSSEDashboardQuery(input, {
    enabled: enabled && canFetch && useSSE,
    inputKey: effectiveRunKey,
    queryId,
  });

  const activeResult = useSSE ? sseResult : trpcResult;

  useEffect(() => {
    if (!markDone) return;
    if (!enabled || !canFetch) return;
    if (activeResult.fetchStatus !== "idle") return;
    if (activeResult.isPending) return;

    markDone(queryId);
  }, [
    canFetch,
    enabled,
    markDone,
    queryId,
    activeResult.fetchStatus,
    activeResult.isPending,
  ]);

  return {
    data: activeResult.data,
    isLoading: activeResult.isLoading,
    isError: activeResult.isError,
    isSuccess: activeResult.isSuccess,
    fetchStatus: activeResult.fetchStatus,
    isPending: activeResult.isPending,
    progress: useSSE ? sseResult.progress : null,
    error: useSSE ? sseResult.error : null,
  };
};
