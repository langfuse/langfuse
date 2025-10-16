import { type ScoreDataType } from "@langfuse/shared";
import {
  createContext,
  useContext,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import { useRouter } from "next/router";

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

  // Target (for filtering)
  traceId?: string;
  observationId?: string;
  sessionId?: string;

  // Cache metadata
  deleted?: boolean;
};

/**
 * Score cache class for storing pending mutations
 * Provides methods to set, get, delete, and filter cached scores
 */
class ScoreCache {
  private cache = new Map<string, CachedScore>();

  set(id: string, score: CachedScore): void {
    this.cache.set(id, score);
  }

  get(id: string): CachedScore | undefined {
    return this.cache.get(id);
  }

  delete(id: string): void {
    this.cache.delete(id);
  }

  clear(): void {
    this.cache.clear();
  }

  /**
   * Get all cached scores for a specific target (trace, observation, or session)
   * Filters out deleted scores
   */
  getAllForTarget(target: {
    traceId?: string;
    observationId?: string;
    sessionId?: string;
  }): CachedScore[] {
    return Array.from(this.cache.values()).filter((s) => {
      if (s.deleted) return false;

      // Session target
      if (target.sessionId) {
        return s.sessionId === target.sessionId;
      }

      // Trace/observation target
      return (
        s.traceId === target.traceId && s.observationId === target.observationId
      );
    });
  }

  /**
   * Get all non-deleted scores in the cache
   */
  getAll(): CachedScore[] {
    return Array.from(this.cache.values()).filter((s) => !s.deleted);
  }
}

type ScoreCacheContextValue = ScoreCache;

const ScoreCacheContext = createContext<ScoreCacheContextValue | undefined>(
  undefined,
);

/**
 * Provider for score cache - clears cache on navigation
 * Mount at project level or around features that need score caching
 */
export function ScoreCacheProvider({ children }: { children: ReactNode }) {
  const cacheRef = useRef(new ScoreCache());
  const router = useRouter();

  // Clear cache on any router query change (navigation, filter changes, etc.)
  useEffect(() => {
    cacheRef.current.clear();
  }, [router.query]);

  return (
    <ScoreCacheContext.Provider value={cacheRef.current}>
      {children}
    </ScoreCacheContext.Provider>
  );
}

/**
 * Hook to access the score cache
 * @throws Error if used outside of ScoreCacheProvider
 */
export function useScoreCache() {
  const context = useContext(ScoreCacheContext);
  if (!context) {
    throw new Error("useScoreCache must be used within ScoreCacheProvider");
  }
  return context;
}
