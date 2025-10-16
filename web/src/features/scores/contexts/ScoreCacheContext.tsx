import { type ScoreDataType } from "@langfuse/shared";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";

/**
 * Cached score shape - stored in client-side cache for optimistic updates
 */
export type CachedScore = {
  // Required for cache operations
  id: string;

  // Score identity
  configId: string;
  name: string;
  dataType: ScoreDataType;
  source: "ANNOTATION";

  // Score values
  value: number | null;
  stringValue: string | null;
  comment: string | null;

  // Target
  traceId?: string;
  observationId?: string;
  sessionId?: string;
};

type ScoreCacheContextValue = {
  set: (id: string, score: CachedScore) => void;
  get: (id: string) => CachedScore | undefined;
  delete: (id: string) => void;
  isDeleted: (id: string) => boolean;
  clear: () => void;

  getAllForTarget: (target: {
    traceId?: string;
    observationId?: string;
    sessionId?: string;
  }) => CachedScore[];

  getAll: () => CachedScore[];
};

const ScoreCacheContext = createContext<ScoreCacheContextValue | undefined>(
  undefined,
);

export function ScoreCacheProvider({ children }: { children: ReactNode }) {
  const [cache, setCache] = useState<Map<string, CachedScore>>(new Map());
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  const set = useCallback((id: string, score: CachedScore) => {
    setCache((prev) => {
      const newCache = new Map(prev);
      newCache.set(id, score);
      return newCache;
    });
  }, []);

  const get = useCallback(
    (id: string) => {
      return cache.get(id);
    },
    [cache],
  );

  const deleteScore = useCallback((id: string) => {
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

  const getAllForTarget = useCallback(
    (target: {
      traceId?: string;
      observationId?: string;
      sessionId?: string;
    }) => {
      return Array.from(cache.values()).filter((s) => {
        // Session target
        if (target.sessionId) {
          return s.sessionId === target.sessionId;
        }

        // Trace/observation target
        return (
          s.traceId === target.traceId &&
          s.observationId === target.observationId
        );
      });
    },
    [cache],
  );

  const getAll = useCallback(() => {
    return Array.from(cache.values());
  }, [cache]);

  return (
    <ScoreCacheContext.Provider
      value={{
        set,
        get,
        delete: deleteScore,
        isDeleted,
        clear,
        getAllForTarget,
        getAll,
      }}
    >
      {children}
    </ScoreCacheContext.Provider>
  );
}

export function useScoreCache() {
  const context = useContext(ScoreCacheContext);
  if (!context) {
    throw new Error("useScoreCache must be used within ScoreCacheProvider");
  }
  return context;
}
