import { createStore, type StoreApi } from "zustand/vanilla";

type SchedulerItemStatus = "queued" | "running" | "done";

type SchedulerItem = {
  id: string;
  priority: number;
  isEligible: boolean;
  runKey: string;
  status: SchedulerItemStatus;
};

type DashboardQuerySchedulerState = {
  /** Immutable record — widgets subscribe to `items[id]?.status`. */
  items: Record<string, SchedulerItem>;
  maxConcurrent: number;
  actions: {
    register: (
      id: string,
      priority: number,
      isEligible?: boolean,
      runKey?: string,
    ) => void;
    unregister: (id: string) => void;
    markDone: (id: string, runKey?: string) => void;
    runNonAbortable: <T>(runKey: string, fetch: () => Promise<T>) => Promise<T>;
    /** Re-queues every item — only for genuine query-param changes (reset key). */
    resetQueue: () => void;
    setMaxConcurrent: (maxConcurrent: number) => void;
  };
};

export type DashboardQuerySchedulerStore =
  StoreApi<DashboardQuerySchedulerState>;

/**
 * Per-mount scheduler for a dashboard's widget queries: widgets register,
 * at most `maxConcurrent` run at once, the rest wait in priority order.
 * Created by the page (lazy useState) and provided via context; widgets
 * subscribe to their own item's status only, so a slot opening re-renders
 * just the widget that got it — not the whole grid.
 */
export function createDashboardQuerySchedulerStore({
  maxConcurrent,
}: {
  maxConcurrent: number;
}): DashboardQuerySchedulerStore {
  const pendingRequests = new Map<string, number>();
  // Promote queued eligible items (by ascending priority) into free running
  // slots. Returns the same reference when nothing changed so subscribers
  // don't wake up.
  const promote = (
    items: Record<string, SchedulerItem>,
    maxConcurrent: number,
  ): Record<string, SchedulerItem> => {
    const reserved = new Map<string, number>();
    let running = 0;
    for (const item of Object.values(items)) {
      if (item.status !== "running") continue;
      running += 1;
      if (pendingRequests.has(item.runKey))
        reserved.set(item.runKey, (reserved.get(item.runKey) ?? 0) + 1);
    }
    // A disabled or unmounted observer can leave an HTTP request running.
    // Count only requests without a corresponding live reservation.
    for (const [key, count] of pendingRequests) {
      running += Math.max(0, count - (reserved.get(key) ?? 0));
    }
    if (running >= maxConcurrent) return items;

    const candidates = Object.values(items)
      .filter((item) => item.status === "queued" && item.isEligible)
      .sort((a, b) => a.priority - b.priority);
    if (candidates.length === 0) return items;

    const next = { ...items };
    for (const candidate of candidates) {
      if (running >= maxConcurrent) break;
      next[candidate.id] = { ...candidate, status: "running" };
      running += 1;
    }
    return next;
  };

  return createStore<DashboardQuerySchedulerState>((set) => ({
    items: {},
    maxConcurrent,
    actions: {
      register: (id, priority, isEligible = true, runKey = id) =>
        set((state) => {
          const existing = state.items[id];
          if (!existing) {
            const items = promote(
              {
                ...state.items,
                [id]: { id, priority, isEligible, runKey, status: "queued" },
              },
              state.maxConcurrent,
            );
            return { items };
          }

          const didRunKeyChange = existing.runKey !== runKey;
          const shouldRequeue =
            (!isEligible && existing.status === "running") ||
            didRunKeyChange ||
            (existing.status === "done" && !existing.isEligible && isEligible);
          const didChange =
            existing.priority !== priority ||
            existing.isEligible !== isEligible ||
            didRunKeyChange;
          if (!didChange) {
            const items = promote(state.items, state.maxConcurrent);
            return items === state.items ? state : { items };
          }

          const items = promote(
            {
              ...state.items,
              [id]: {
                ...existing,
                priority,
                isEligible,
                runKey,
                status: shouldRequeue ? "queued" : existing.status,
              },
            },
            state.maxConcurrent,
          );
          return { items };
        }),

      unregister: (id) =>
        set((state) => {
          if (!state.items[id]) return state;
          const { [id]: _removed, ...rest } = state.items;
          return { items: promote(rest, state.maxConcurrent) };
        }),

      markDone: (id, runKey) =>
        set((state) => {
          const item = state.items[id];
          if (
            !item ||
            item.status !== "running" ||
            !item.isEligible ||
            (runKey !== undefined && item.runKey !== runKey)
          )
            return state;
          return {
            items: promote(
              { ...state.items, [id]: { ...item, status: "done" } },
              state.maxConcurrent,
            ),
          };
        }),

      runNonAbortable: async (runKey, fetch) => {
        pendingRequests.set(runKey, (pendingRequests.get(runKey) ?? 0) + 1);
        try {
          return await fetch();
        } finally {
          const remaining = pendingRequests.get(runKey)! - 1;
          if (remaining === 0) pendingRequests.delete(runKey);
          else pendingRequests.set(runKey, remaining);
          set((state) => {
            const items = promote(state.items, state.maxConcurrent);
            return items === state.items ? state : { items };
          });
        }
      },

      resetQueue: () =>
        set((state) => {
          let changed = false;
          const requeued: Record<string, SchedulerItem> = {};
          for (const item of Object.values(state.items)) {
            if (item.status !== "queued") {
              requeued[item.id] = { ...item, status: "queued" };
              changed = true;
            } else {
              requeued[item.id] = item;
            }
          }
          if (!changed) {
            const items = promote(state.items, state.maxConcurrent);
            return items === state.items ? state : { items };
          }
          return { items: promote(requeued, state.maxConcurrent) };
        }),

      setMaxConcurrent: (maxConcurrent) =>
        set((state) => ({
          maxConcurrent,
          items: promote(state.items, maxConcurrent),
        })),
    },
  }));
}
