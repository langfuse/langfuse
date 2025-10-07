import { isTraceScore } from "@/src/features/scores/lib/helpers";
import { type ScoreColumn } from "@/src/features/scores/types";
import {
  type ScoreAggregate,
  type CreateAnnotationScoreData,
  type UpdateAnnotationScoreData,
} from "@langfuse/shared";
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";

type CachedScore = {
  configId: string;
  traceId: string;
  observationId?: string;
  value: number | null;
  stringValue: string | null;
  comment: string | null;
};

type ScoreId = string;

type ScoreWriteCacheContextValue = {
  creates: Map<ScoreId, CachedScore>;
  updates: Map<ScoreId, CachedScore>;
  deletes: Set<ScoreId>;
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

  const cacheCreate = useCallback(
    (key: ScoreId, score: CreateAnnotationScoreData) => {
      const cachedScore = transformScore(score);
      if (!cachedScore) return;
      setCreates((prev) => new Map(prev).set(key, cachedScore));
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
  }, []);

  const value = useMemo(
    () => ({
      creates,
      updates,
      deletes,
      cacheCreate,
      cacheUpdate,
      cacheDelete,
      clearWrites,
    }),
    [
      creates,
      updates,
      deletes,
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

/**
 * Merge cached score writes into score aggregates for optimistic UI updates.
 *
 * This function overlays cached creates/updates/deletes on top of ClickHouse
 * aggregates to provide immediate feedback despite eventual consistency.
 *
 * IMPORTANT: This should ONLY be used for display in DatasetAggregateTableCell.
 * Never use this for activeCell.scoreAggregate data passed to AnnotationPanel.
 *
 * @param scoreAggregate - Score aggregates from ClickHouse query
 * @param cache - Score write cache with creates/updates/deletes
 * @param traceId - Trace ID for matching cached creates by traceId+configId
 * @param observationId - Optional observation ID for matching cached creates
 * @param scoreColumns - Score column definitions with configId mappings
 * @returns Merged score aggregate with cached writes applied
 */
export function mergeScoreAggregateWithCache(
  scoreAggregate: ScoreAggregate,
  cache: ScoreWriteCacheContextValue,
  traceId: string,
  observationId: string | undefined,
  scoreColumns: ScoreColumn[],
): ScoreAggregate {
  const merged = { ...scoreAggregate };

  for (const [aggregateKey, aggregate] of Object.entries(merged)) {
    const scoreColumn = scoreColumns.find((col) => col.key === aggregateKey);
    if (!scoreColumn) continue;

    const scoreId = aggregate.id;

    // Handle existing scores (with scoreId)
    if (scoreId) {
      // Check if deleted - remove from aggregate entirely
      if (cache.deletes.has(scoreId)) {
        delete merged[aggregateKey];
        continue;
      }

      // Check for cached update (keyed by scoreId)
      const cachedUpdate = cache.updates.get(scoreId);
      if (cachedUpdate) {
        if (aggregate.type === "NUMERIC" && cachedUpdate.value) {
          merged[aggregateKey] = {
            ...aggregate,
            values: [cachedUpdate.value as number],
            comment: cachedUpdate.comment,
            average: cachedUpdate.value as number,
          };
        } else if (aggregate.type === "CATEGORICAL") {
          merged[aggregateKey] = {
            ...aggregate,
            values: [cachedUpdate.stringValue as string],
            comment: cachedUpdate.comment,
          };
        }
        continue;
      }
    }

    // Handle new scores (no scoreId yet - id is null in aggregate)
    // Match by traceId, observationId, and configId from cached score
    if (!scoreId) {
      // Search through creates for matching traceId+observationId
      for (const [createdScoreId, cachedCreate] of cache.creates.entries()) {
        if (
          cachedCreate.traceId === traceId &&
          cachedCreate.observationId === observationId
        ) {
          if (aggregate.type === "NUMERIC") {
            merged[aggregateKey] = {
              ...aggregate,
              id: createdScoreId,
              values: [cachedCreate.value as number],
              comment: cachedCreate.comment,
              average: cachedCreate.value as number,
            };
          } else if (aggregate.type === "CATEGORICAL") {
            merged[aggregateKey] = {
              ...aggregate,
              id: createdScoreId,
              values: [cachedCreate.stringValue as string],
              comment: cachedCreate.comment,
            };
          }
          break;
        }
      }
    }
  }

  return merged;
}
