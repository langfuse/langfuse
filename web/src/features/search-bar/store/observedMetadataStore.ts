// Persisted per-project map of observed metadata paths → types, feeding the
// search bar's `metadata.<path>` key suggestions (lib/metadata-paths.ts owns
// the analysis; hooks/useObservedMetadata.ts is the bridge).
//
// Same shape rationale as globalDateRangeStore: one global store holding a
// `Record<projectId, …>` map, so switching projects selects a different field
// instead of re-hydrating a per-project key (which could clobber another
// project's entry on an in-app switch). SSR gets a no-op storage.
//
// Growth is bounded on every axis (metadata is user-shaped and unbounded):
// keys per project and values per key/per project are capped on merge
// (MAX_PATHS_PER_PROJECT / MAX_VALUES_PER_KEY / MAX_VALUES_PER_PROJECT,
// drop-new when full), projects are capped with least-recently-updated
// eviction, and a merge that changes nothing skips the localStorage write
// entirely.

import { create } from "zustand";
import {
  createJSONStorage,
  persist,
  type StateStorage,
} from "zustand/middleware";
import {
  MAX_PATHS_PER_PROJECT,
  MAX_VALUES_PER_KEY,
  MAX_VALUES_PER_PROJECT,
  mergePathType,
  type StoredKeyInfo,
} from "../lib/metadata-paths";

export const OBSERVED_METADATA_STORAGE_KEY = "langfuse-observed-metadata";

const MAX_PROJECTS = 20;
// A merge that changes nothing still refreshes the LRU stamp when it is older
// than this, so an actively-viewed project with a long-stable map outlives a
// stale one — without a localStorage write on every fetch.
const LRU_TOUCH_INTERVAL_MS = 24 * 60 * 60 * 1000;

// No-op storage on the server; the real localStorage is used on the client.
const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

type ProjectMetadataPaths = {
  /** Observed top-level key → stored type + sample values (see StoredKeyInfo). */
  paths: Record<string, StoredKeyInfo>;
  /** Last change (or daily activity refresh) — the project-eviction LRU key. */
  updatedAt: number;
};

type ObservedMetadataState = {
  byProject: Record<string, ProjectMetadataPaths>;
  actions: {
    /** Union newly observed paths into a project's map (see mergeIntoProject). */
    recordPaths: (
      projectId: string,
      collected: ReadonlyMap<string, StoredKeyInfo>,
    ) => void;
  };
};

/**
 * Pure merge: union `collected` into the project's path map — merging types
 * per key (mixed-absorbing) and unioning observed values (first-observed
 * wins) — enforcing the per-project key cap, the per-key and per-project
 * value caps, and the project-count cap (evict least-recently-updated).
 * Returns null when nothing needs persisting. Exported for tests.
 */
export function mergeIntoProject(
  byProject: Record<string, ProjectMetadataPaths>,
  projectId: string,
  collected: ReadonlyMap<string, StoredKeyInfo>,
  now: number,
): Record<string, ProjectMetadataPaths> | null {
  if (collected.size === 0) return null;
  const prev = byProject[projectId];
  const nextPaths: Record<string, StoredKeyInfo> = { ...(prev?.paths ?? {}) };
  let count = Object.keys(nextPaths).length;
  let totalValues = Object.values(nextPaths).reduce(
    (sum, info) => sum + (info.values?.length ?? 0),
    0,
  );
  let changed = false;
  for (const [path, incoming] of collected) {
    // Own-property lookup: a key shadowing an Object.prototype member
    // ("toString", "constructor", …) must read as unseen, not as the
    // inherited function — which would bypass the cap counter and crash or
    // pin the type to "mixed" (`nextPaths["constructor"].values` resolves to
    // the static Object.values).
    const existing = Object.hasOwn(nextPaths, path)
      ? nextPaths[path]
      : undefined;
    if (existing === undefined) {
      if (count >= MAX_PATHS_PER_PROJECT) continue;
      count++;
    }
    const mergedType = mergePathType(existing?.type, incoming.type);
    let mergedValues = existing?.values;
    for (const v of incoming.values ?? []) {
      if ((mergedValues?.length ?? 0) >= MAX_VALUES_PER_KEY) break;
      if (totalValues >= MAX_VALUES_PER_PROJECT) break;
      if (mergedValues?.includes(v)) continue;
      mergedValues = [...(mergedValues ?? []), v];
      totalValues++;
    }
    if (
      existing === undefined ||
      existing.type !== mergedType ||
      mergedValues !== existing.values
    ) {
      nextPaths[path] =
        mergedValues === undefined
          ? { type: mergedType }
          : { type: mergedType, values: mergedValues };
      changed = true;
    }
  }
  // `prev` exists whenever nothing changed: an absent project entry always
  // changes on a non-empty `collected` (guarded above).
  if (!changed && now - prev!.updatedAt < LRU_TOUCH_INTERVAL_MS) return null;

  const next: Record<string, ProjectMetadataPaths> = {
    ...byProject,
    [projectId]: {
      paths: changed ? nextPaths : prev!.paths,
      updatedAt: now,
    },
  };
  const ids = Object.keys(next);
  if (ids.length > MAX_PROJECTS) {
    ids
      .sort((a, b) => next[a]!.updatedAt - next[b]!.updatedAt)
      .slice(0, ids.length - MAX_PROJECTS)
      .forEach((id) => delete next[id]);
  }
  return next;
}

export const useObservedMetadataStore = create<ObservedMetadataState>()(
  persist(
    (set, get) => ({
      byProject: {},
      actions: {
        recordPaths: (projectId, collected) => {
          const next = mergeIntoProject(
            get().byProject,
            projectId,
            collected,
            Date.now(),
          );
          if (next !== null) set({ byProject: next });
        },
      },
    }),
    {
      name: OBSERVED_METADATA_STORAGE_KEY,
      version: 2,
      // Hydrates from localStorage on the client; no-op during SSR.
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? window.localStorage : noopStorage,
      ),
      // Persist only data, never the actions object.
      partialize: (state) => ({ byProject: state.byProject }),
      // On any schema change, start fresh — the map is a rebuildable cache.
      migrate: () => ({ byProject: {} }),
    },
  ),
);
