import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";

type CachedScore = {
  id: string;
  value: number;
  stringValue: string | null;
  comment: string | null;
};

type ScoreCacheKey = string;

type ScoreWriteCacheContextValue = {
  writes: Map<ScoreCacheKey, CachedScore>;
  cacheWrite: (key: ScoreCacheKey, score: CachedScore) => void;
  clearWrites: () => void;
};

/**
 * Client-side write cache for annotation score updates.
 *
 * Provides optimistic UI updates for score edits while server persistence
 * is in flight. Cleared on navigation/refresh. Overlays API responses for
 * immediate consistency despite ClickHouse eventual consistency.
 */
const ScoreWriteCacheContext = createContext<
  ScoreWriteCacheContextValue | undefined
>(undefined);

export function ScoreWriteCacheProvider({ children }: { children: ReactNode }) {
  const [writes, setWrites] = useState<Map<ScoreCacheKey, CachedScore>>(
    new Map(),
  );

  const cacheWrite = useCallback((key: ScoreCacheKey, score: CachedScore) => {
    setWrites((prev) => new Map(prev).set(key, score));
  }, []);

  const clearWrites = useCallback(() => {
    setWrites(new Map());
  }, []);

  const value = useMemo(
    () => ({ writes, cacheWrite, clearWrites }),
    [writes, cacheWrite, clearWrites],
  );

  return (
    <ScoreWriteCacheContext.Provider value={value}>
      {children}
    </ScoreWriteCacheContext.Provider>
  );
}

export function useScoreWriteCache() {
  const context = useContext(ScoreWriteCacheContext);
  if (!context) {
    throw new Error(
      "useScoreWriteCache must be used within ScoreWriteCacheProvider",
    );
  }
  return context;
}

/**
 * Generate cache key for score write.
 * Format: scoreId only (unique per project)
 */
export function getScoreCacheKey(scoreId: string): ScoreCacheKey {
  return scoreId;
}
