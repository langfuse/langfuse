import {
  type TimeRange,
  toAbsoluteTimeRange,
} from "@/src/utils/date-range-utils";
import { api, type RouterInputs } from "@/src/utils/api";
import { hashKey } from "@tanstack/react-query";
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
};

const DashboardQuerySchedulerContext =
  createContext<DashboardQuerySchedulerContextValue | null>(null);

export const DashboardQuerySchedulerProvider = ({
  scheduler,
  children,
}: {
  scheduler: DashboardQuerySchedulerContextValue["scheduler"];
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
    }),
    [
      scheduler.register,
      scheduler.unregister,
      scheduler.canFetch,
      scheduler.markDone,
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
type DashboardExecuteQueryOptions = NonNullable<
  Parameters<
    typeof api.dashboard.executeQuery.useQuery<Record<string, unknown>[]>
  >[1]
>;
type ScheduledDashboardExecuteQueryOptions = Omit<
  DashboardExecuteQueryOptions,
  "enabled" | "meta"
> & {
  enabled?: boolean;
  meta?: DashboardExecuteQueryOptions["meta"];
  priority?: number;
  queryId: string;
  runKey?: string;
};

const getDefaultRunKey = (input: DashboardExecuteQueryInput) =>
  hashKey([input]);

export const useScheduledDashboardExecuteQuery = (
  input: DashboardExecuteQueryInput,
  {
    enabled = true,
    meta,
    priority = 1000,
    queryId,
    runKey,
    ...queryOptions
  }: ScheduledDashboardExecuteQueryOptions,
) => {
  const context = useDashboardQuerySchedulerContext();
  const scheduler = context?.scheduler;
  const register = scheduler?.register;
  const unregister = scheduler?.unregister;
  const markDone = scheduler?.markDone;
  const effectiveRunKey = useMemo(
    () => runKey ?? getDefaultRunKey(input),
    [input, runKey],
  );

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

  const queryResult = api.dashboard.executeQuery.useQuery<
    Record<string, unknown>[]
  >(input, {
    ...queryOptions,
    enabled: enabled && canFetch,
    meta,
  });

  useEffect(() => {
    if (!markDone) return;
    if (!enabled || !canFetch) return;
    if (queryResult.fetchStatus !== "idle") return;
    if (queryResult.isPending) return;

    markDone(queryId);
  }, [
    canFetch,
    enabled,
    markDone,
    queryId,
    queryResult.fetchStatus,
    queryResult.isPending,
  ]);

  return queryResult;
};
