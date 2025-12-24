import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";

/**
 * Cached correction metadata - stored in client-side cache for optimistic updates
 *
 * Note: Value is NOT cached to avoid large JSON blobs in memory
 *
 * Corrections are special annotation scores with the following constraints:
 * - Name is always "output"
 * - Only one correction per [traceId, observationId] combination
 * - If observationId is null, correction applies to the trace
 */
export type CachedCorrectionMeta = {
  id: string;
  timestamp: Date;
  projectId: string;
  traceId: string;
  observationId?: string;
  environment?: string;
};

type CorrectionCacheContextValue = {
  /** Add or update a correction in the cache (for optimistic updates) */
  set: (id: string, meta: CachedCorrectionMeta) => void;

  /** Retrieve a correction from the cache */
  get: (id: string) => CachedCorrectionMeta | undefined;

  /** Get correction for a specific observation */
  getForObservation: (
    observationId: string,
  ) => CachedCorrectionMeta | undefined;

  /** Mark a correction as deleted (user-initiated delete, adds to deletedIds Set + removes from cache Map) */
  delete: (id: string) => void;

  /** Rollback a failed optimistic set/update (removes from cache without marking as deleted) */
  rollbackSet: (id: string) => void;

  /** Rollback a failed delete (removes from deletedIds Set, optionally restores to cache Map if correction provided) */
  rollbackDelete: (id: string, meta?: CachedCorrectionMeta) => void;

  /** Check if a correction is marked as deleted */
  isDeleted: (id: string) => boolean;

  /** Clear all cached corrections and deletedIds */
  clear: () => void;
};

const CorrectionCacheContext = createContext<
  CorrectionCacheContextValue | undefined
>(undefined);

export function CorrectionCacheProvider({ children }: { children: ReactNode }) {
  const [cache, setCache] = useState<Map<string, CachedCorrectionMeta>>(
    new Map(),
  );
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  const set = useCallback((id: string, meta: CachedCorrectionMeta) => {
    setCache((prev) => {
      const newCache = new Map(prev);
      newCache.set(id, meta);
      return newCache;
    });
  }, []);

  const get = useCallback(
    (id: string) => {
      return cache.get(id);
    },
    [cache],
  );

  const getForObservation = useCallback(
    (observationId: string) => {
      return Array.from(cache.values()).find(
        (meta) =>
          meta.observationId === observationId && !deletedIds.has(meta.id),
      );
    },
    [cache, deletedIds],
  );

  const deleteCorrection = useCallback((id: string) => {
    setDeletedIds((prev) => {
      const newSet = new Set(prev);
      newSet.add(id);
      return newSet;
    });
    // Also remove from cache if present
    setCache((prev) => {
      if (!prev.has(id)) return prev;
      const newCache = new Map(prev);
      newCache.delete(id);
      return newCache;
    });
  }, []);

  const rollbackSet = useCallback((id: string) => {
    // Remove from cache without marking as deleted
    setCache((prev) => {
      if (!prev.has(id)) return prev;
      const newCache = new Map(prev);
      newCache.delete(id);
      return newCache;
    });
  }, []);

  const rollbackDelete = useCallback(
    (id: string, meta?: CachedCorrectionMeta) => {
      setDeletedIds((prev) => {
        if (!prev.has(id)) return prev;
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });

      if (meta) {
        setCache((prev) => {
          const newCache = new Map(prev);
          newCache.set(id, meta);
          return newCache;
        });
      }
    },
    [],
  );

  const isDeleted = useCallback(
    (id: string) => {
      return deletedIds.has(id);
    },
    [deletedIds],
  );

  const clear = useCallback(() => {
    setCache(new Map());
    setDeletedIds(new Set());
  }, []);

  return (
    <CorrectionCacheContext.Provider
      value={{
        set,
        get,
        getForObservation,
        delete: deleteCorrection,
        rollbackSet,
        rollbackDelete,
        isDeleted,
        clear,
      }}
    >
      {children}
    </CorrectionCacheContext.Provider>
  );
}

export function useCorrectionCache() {
  const context = useContext(CorrectionCacheContext);
  if (!context) {
    throw new Error(
      "useCorrectionCache must be used within CorrectionCacheProvider",
    );
  }
  return context;
}
