import { type CachedScore } from "@/src/features/datasets/lib/score-write-cache/types";
import { composeAggregateScoreKey } from "@/src/features/scores/lib/aggregateScores";
import { isTraceScore } from "@/src/features/scores/lib/helpers";
import { type ScoreColumn } from "@/src/features/scores/types";
import {
  type UpdateAnnotationScoreData,
  type CreateAnnotationScoreData,
} from "@langfuse/shared";
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";

type ScoreId = string;

type ScoreWriteCacheContextValue = {
  creates: Map<ScoreId, CachedScore>;
  updates: Map<ScoreId, CachedScore>;
  deletes: Set<ScoreId>;
  scoreColumns: ScoreColumn[];
  cacheCreate: (key: ScoreId, score: CreateAnnotationScoreData) => void;
  cacheUpdate: (key: ScoreId, score: UpdateAnnotationScoreData) => void;
  cacheDelete: (key: ScoreId) => void;
  clearWrites: () => void;
};

/*
 * Transforms a CreateAnnotationScoreData or UpdateAnnotationScoreData into a CachedScore
 * If the score is not a trace score or does not have a configId, returns null
 */
function transformScore(
  score: CreateAnnotationScoreData | UpdateAnnotationScoreData,
): CachedScore | null {
  if (!isTraceScore(score.scoreTarget) || !score.configId) return null;
  return {
    name: score.name,
    dataType: score.dataType === "BOOLEAN" ? "CATEGORICAL" : score.dataType, // TODO: verify this
    configId: score.configId,
    traceId: score.scoreTarget.traceId,
    observationId: score.scoreTarget.observationId,
    value: score.value ?? null,
    stringValue: score.stringValue ?? null,
    comment: score.comment ?? null,
  };
}

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
  const [creates, setCreates] = useState<Map<ScoreId, CachedScore>>(new Map());
  const [updates, setUpdates] = useState<Map<ScoreId, CachedScore>>(new Map());
  const [deletes, setDeletes] = useState<Set<ScoreId>>(new Set());
  const [scoreColumns, setScoreColumns] = useState<ScoreColumn[]>([]);

  const cacheCreate = useCallback(
    (key: ScoreId, score: CreateAnnotationScoreData) => {
      const cachedScore = transformScore(score);
      if (!cachedScore) return;
      setCreates((prev) => new Map(prev).set(key, cachedScore));

      // Add optimistic score column
      const columnKey = composeAggregateScoreKey({
        name: score.name,
        dataType: score.dataType,
        source: "ANNOTATION",
      });

      setScoreColumns((prev) => {
        if (prev.some((col) => col.key === columnKey)) {
          return prev; // Already exists, no change
        }

        return [
          ...prev,
          {
            key: columnKey,
            name: score.name,
            dataType: score.dataType,
            source: "ANNOTATION",
          },
        ];
      });

      // Remove from deletes if it was previously deleted
      setDeletes((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    },
    [],
  );

  const cacheUpdate = useCallback(
    (key: ScoreId, score: UpdateAnnotationScoreData) => {
      const cachedScore = transformScore(score);
      if (!cachedScore) return;
      setUpdates((prev) => new Map(prev).set(key, cachedScore));
    },
    [],
  );

  const cacheDelete = useCallback((key: ScoreId) => {
    setDeletes((prev) => new Set(prev).add(key));
    // Remove from creates and updates
    setCreates((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
    setUpdates((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const clearWrites = useCallback(() => {
    setCreates(new Map());
    setUpdates(new Map());
    setDeletes(new Set());
    setScoreColumns([]);
  }, []);

  const value = useMemo(
    () => ({
      creates,
      updates,
      deletes,
      scoreColumns,
      cacheCreate,
      cacheUpdate,
      cacheDelete,
      clearWrites,
    }),
    [
      creates,
      updates,
      deletes,
      scoreColumns,
      cacheCreate,
      cacheUpdate,
      cacheDelete,
      clearWrites,
    ],
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
