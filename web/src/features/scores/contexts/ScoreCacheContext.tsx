import { type ScoreDomain } from "@langfuse/shared";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";
import { type ScoreColumn } from "@/src/features/scores/types";
import { composeAggregateScoreKey } from "@/src/features/scores/lib/aggregateScores";

/**
 * Cached score shape - stored in client-side cache for optimistic updates
 */
export type CachedScore = Pick<
  ScoreDomain,
  // Required for cache operations
  | "id"
  // Project context
  | "projectId"
  | "environment"
  // Score identity
  | "name"
  | "dataType"
  // Score values
  | "value"
  | "stringValue"
  | "comment"
  // Target
  | "traceId"
  | "observationId"
  | "sessionId"
  | "timestamp"
> & {
  // Score identity - non-nullable
  configId: string;
  source: "ANNOTATION";
};

type ScoreCacheContextValue = {
  set: (id: string, score: CachedScore) => void;
  get: (id: string) => CachedScore | undefined;
  delete: (id: string) => void;
  isDeleted: (id: string) => boolean;
  clear: () => void;

  getAllForTarget: (
    mode: "target-and-child-scores" | "target-scores-only",
    target: {
      traceId?: string;
      observationId?: string;
      sessionId?: string;
    },
  ) => CachedScore[];

  getAll: () => CachedScore[];

  // Score columns cache
  setColumn: (column: Omit<ScoreColumn, "key">) => void;
  getColumnsMap: () => Map<string, ScoreColumn>;
};

const ScoreCacheContext = createContext<ScoreCacheContextValue | undefined>(
  undefined,
);

export function ScoreCacheProvider({ children }: { children: ReactNode }) {
  const [cache, setCache] = useState<Map<string, CachedScore>>(new Map());
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [columnsCache, setColumnsCache] = useState<Map<string, ScoreColumn>>(
    new Map(),
  );

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
    (
      mode: "target-and-child-scores" | "target-scores-only",
      target: {
        traceId?: string;
        observationId?: string;
        sessionId?: string;
      },
    ) => {
      const matchObservationScore = (
        mode: "target-and-child-scores" | "target-scores-only",
      ) => {
        switch (mode) {
          case "target-and-child-scores":
            return () => true;
          case "target-scores-only":
            return (s: CachedScore) =>
              s.observationId === (target.observationId ?? null);
          default:
            throw new Error(`Invalid mode: ${mode}`);
        }
      };

      return Array.from(cache.values()).filter((s) => {
        // Session target
        if (target.sessionId) {
          return s.sessionId === target.sessionId;
        }

        // Trace/observation target
        return s.traceId === target.traceId && matchObservationScore(mode)(s);
      });
    },
    [cache],
  );

  const getAll = useCallback(() => {
    return Array.from(cache.values());
  }, [cache]);

  const setColumn = useCallback((column: Omit<ScoreColumn, "key">) => {
    setColumnsCache((prev) => {
      const key = composeAggregateScoreKey(column);
      if (prev.has(key)) {
        return prev;
      }
      const newCache = new Map(prev);
      newCache.set(key, { ...column, key });
      return newCache;
    });
  }, []);

  const getColumnsMap = useCallback(() => {
    return columnsCache;
  }, [columnsCache]);

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
        setColumn,
        getColumnsMap,
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
