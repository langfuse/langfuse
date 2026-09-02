import {
  type TimeRange,
  toAbsoluteTimeRange,
} from "@/src/utils/date-range-utils";
import { api, type RouterInputs, type RouterOutputs } from "@/src/utils/api";
import { hashKey, useQuery, type UseQueryOptions } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useStore } from "zustand";
import {
  createDashboardQuerySchedulerStore,
  type DashboardQuerySchedulerStore,
} from "@/src/features/dashboard/stores/dashboardQuerySchedulerStore";
import {
  useSSEDashboardQuery,
  type QueryProgress,
} from "@/src/hooks/useSSEDashboardQuery";

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

/**
 * Reset key for the dashboard-detail query scheduler.
 *
 * When this key changes, the scheduler re-queues every in-flight and completed
 * widget (see `resetQueue`). It must therefore reflect ONLY parameters that
 * genuinely invalidate query results — time range, filters, environment — and
 * NOT the set of widgets present on the dashboard. Adding or removing a widget
 * registers/unregisters incrementally and must not disturb already-rendered
 * siblings (which, on the SSE path, would blank while they re-stream).
 *
 * Note: this is the reset key for the dashboard-detail page only. The Home page
 * builds its own inline reset key (it additionally keys on metricsVersion and
 * has never folded in the widget set), so this helper is not a single source of
 * truth for every dashboard-like surface.
 */
export const getDashboardSchedulerResetKey = (params: {
  projectId: string;
  dashboardId: string;
  fromIso: string;
  toIso: string;
  filters: unknown;
  environments: string[];
}): string =>
  [
    params.projectId,
    params.dashboardId,
    params.fromIso,
    params.toIso,
    JSON.stringify(params.filters),
    params.environments.join(","),
  ].join("|");

const parseIsoDateMs = (value: unknown): number | null => {
  if (typeof value !== "string") return null;

  const parsedMs = Date.parse(value);
  if (Number.isNaN(parsedMs)) return null;

  return parsedMs;
};

/**
 * Owns one per-mount scheduler store for a dashboard page: creates it lazily
 * and syncs the two page-driven inputs (concurrency budget, reset key) into
 * store actions. Scheduler state changes no longer re-render the page — the
 * store notifies only the widgets whose slot changed.
 */
export const useDashboardQueryScheduler = ({
  maxConcurrent,
  resetKey,
}: {
  maxConcurrent: number;
  resetKey?: string;
}): DashboardQuerySchedulerStore => {
  const [store] = useState(() =>
    createDashboardQuerySchedulerStore({ maxConcurrent }),
  );

  useEffect(() => {
    if (store.getState().maxConcurrent !== maxConcurrent) {
      store.getState().actions.setMaxConcurrent(maxConcurrent);
    }
  }, [maxConcurrent, store]);

  // Re-queue everything only when the key actually changes — never on mount.
  const previousResetKeyRef = useRef<string | undefined>(resetKey);
  useEffect(() => {
    if (previousResetKeyRef.current === resetKey) return;
    previousResetKeyRef.current = resetKey;
    store.getState().actions.resetQueue();
  }, [resetKey, store]);

  return store;
};

type DashboardQuerySchedulerContextValue = {
  store: DashboardQuerySchedulerStore;
  shouldBucketQueriesByTimeRange: boolean;
};

const DashboardQuerySchedulerContext =
  createContext<DashboardQuerySchedulerContextValue | null>(null);

export const DashboardQuerySchedulerProvider = ({
  store,
  shouldBucketQueriesByTimeRange = false,
  children,
}: {
  store: DashboardQuerySchedulerStore;
  shouldBucketQueriesByTimeRange?: boolean;
  children: ReactNode;
}) => {
  const contextValue = useMemo(
    () => ({ store, shouldBucketQueriesByTimeRange }),
    [store, shouldBucketQueriesByTimeRange],
  );

  return (
    <DashboardQuerySchedulerContext.Provider value={contextValue}>
      {children}
    </DashboardQuerySchedulerContext.Provider>
  );
};

// Surfaces without a provider (e.g. a single widget embedded outside a
// dashboard) share one unmanaged store with an unlimited budget: every
// registration is promoted immediately, so `canFetch` is effectively true.
// Because it is shared module-wide, provider-less consumers must use
// queryIds unique per mounted instance — a collision would let one
// consumer's unmount unregister the other's slot.
const unmanagedSchedulerStore = createDashboardQuerySchedulerStore({
  maxConcurrent: Number.POSITIVE_INFINITY,
});

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
  const context = useContext(DashboardQuerySchedulerContext);
  const utils = api.useUtils();
  const store = context?.store ?? unmanagedSchedulerStore;
  const { actions } = store.getState();
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
    return () => {
      actions.unregister(queryId);
    };
  }, [queryId, actions]);

  useEffect(() => {
    actions.register(queryId, priority, enabled, effectiveRunKey);
  }, [effectiveRunKey, enabled, priority, queryId, actions]);

  // Reactive slot subscription: only this widget re-renders when its slot
  // opens — never the page or its siblings.
  const canFetch = useStore(
    store,
    (state) => state.items[queryId]?.status === "running",
  );

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

  // SSE path (opt-in) — same cache key as the tRPC path, so identical widgets
  // share one stream and a transport flip reuses cached rows.
  const sseResult = useSSEDashboardQuery(input, {
    enabled: enabled && canFetch && useSSE,
    queryKey: queryCacheKey,
    staleTime:
      typeof queryOptions.staleTime === "number"
        ? queryOptions.staleTime
        : cachePolicy.staleTime,
    gcTime: queryOptions.gcTime ?? cachePolicy.gcTime,
    meta,
  });

  const activeResult = useSSE ? sseResult : trpcResult;

  // Release the scheduler slot whenever this query stops fetching for ANY
  // reason — success, error, stall timeout, or abort. Holding a slot on a
  // failed stream would freeze the whole dashboard at low concurrency.
  useEffect(() => {
    if (!enabled || !canFetch) return;
    if (activeResult.fetchStatus !== "idle") return;
    if (activeResult.isPending) return;

    actions.markDone(queryId);
  }, [
    canFetch,
    enabled,
    actions,
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
