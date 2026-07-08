// Global time-range store — the persisted per-user DEFAULT, one source per concern.
//
// Data direction is deliberately one-way and un-merged (the presence-XOR rule;
// LFE-10497). There are two independent sources, reconciled by a pure resolver
// (`resolveTimeRange`) in `useGlobalDateRange`, never merged:
//
//   - the URL `?dateRange=` is the route source of truth for an EXPLICIT
//     selection (shareable / deep-linkable), owned by use-query-params;
//   - this store is the cross-route source of truth for the per-user DEFAULT,
//     in relative meta-format ("7d" / "<from>-<to>"), persisted to localStorage.
//
// The default is kept here — not in the URL — so a clean navigation reads the
// default and leaves the URL clean, and a shared link carries only what the
// user explicitly set.
//
// Why a single global store keyed by project (not a per-mount hook reading a
// per-project localStorage key): the whole map lives in one in-memory store, so
// switching projects merely selects a different field. There is no per-mount
// re-hydration and therefore no way to clobber project B's default with project
// A's value on an in-app project switch.

import { create } from "zustand";
import {
  createJSONStorage,
  persist,
  type StateStorage,
} from "zustand/middleware";

export const GLOBAL_DATE_RANGE_STORAGE_KEY = "langfuse-global-date-range";

// No-op storage on the server; the real localStorage is used on the client.
const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

type GlobalDateRangeState = {
  /**
   * Per-project default time range in relative meta-format. Scoped by project so
   * a tightly-zoomed debugging range in one project does not leak into another.
   */
  defaultsByProject: Record<string, string>;
  actions: {
    /** Persist the per-user default for a project (an explicit user pick). */
    setProjectDefault: (projectId: string, encoded: string) => void;
  };
};

export const useGlobalDateRangeStore = create<GlobalDateRangeState>()(
  persist(
    (set) => ({
      defaultsByProject: {},
      actions: {
        setProjectDefault: (projectId, encoded) =>
          set((state) => ({
            defaultsByProject: {
              ...state.defaultsByProject,
              [projectId]: encoded,
            },
          })),
      },
    }),
    {
      name: GLOBAL_DATE_RANGE_STORAGE_KEY,
      // Hydrates from localStorage on the client; no-op during SSR.
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? window.localStorage : noopStorage,
      ),
      // Persist only data, never the actions object.
      partialize: (state) => ({ defaultsByProject: state.defaultsByProject }),
    },
  ),
);
