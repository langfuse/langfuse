import {
  composeAggregateScoreKey,
  resolveAggregateType,
} from "@/src/features/scores/lib/aggregateScores";
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
  name: string;
  dataType: "NUMERIC" | "CATEGORICAL";
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

/**
 * Check if a score has been deleted in cache
 */
function isDeleted(
  scoreId: string,
  cache: ScoreWriteCacheContextValue,
): boolean {
  return cache.deletes.has(scoreId);
}

/**
 * Apply cached update to existing aggregate.
 * Handles both NUMERIC and CATEGORICAL types.
 */
function applyUpdate(
  aggregate: ScoreAggregate[string],
  update: CachedScore,
): ScoreAggregate[string] {
  if (aggregate.type === "NUMERIC") {
    const value = update.value as number;
    return {
      ...aggregate,
      values: [value],
      average: value,
      comment: update.comment,
    };
  }

  // CATEGORICAL
  const value = update.stringValue as string;
  return {
    ...aggregate,
    values: [value],
    valueCounts: [{ value, count: 1 }],
    comment: update.comment,
  };
}

/**
 * Find a cached create matching trace/observation/column.
 * Returns [scoreId, cachedScore] or null if no match.
 */
function findMatchingCreate(
  creates: Map<string, CachedScore>,
  traceId: string,
  observationId: string | undefined,
  scoreName: string,
  scoreDataType: "NUMERIC" | "CATEGORICAL",
): [string, CachedScore] | null {
  for (const [scoreId, cachedScore] of creates.entries()) {
    if (
      cachedScore.traceId === traceId &&
      cachedScore.observationId === observationId &&
      cachedScore.name === scoreName &&
      cachedScore.dataType === scoreDataType
    ) {
      return [scoreId, cachedScore];
    }
  }
  return null;
}

/**
 * Build aggregate from cached create.
 * If update provided, apply it on top of create.
 */
function buildAggregateFromCreate(
  cachedScore: CachedScore,
  scoreId: string,
  update?: CachedScore,
): ScoreAggregate[string] {
  // Determine final values (use update if available, else create)
  const finalValue = (update?.value ?? cachedScore.value) as number;
  const finalStringValue = (update?.stringValue ??
    cachedScore.stringValue) as string;
  const finalComment = update?.comment ?? cachedScore.comment;

  if (cachedScore.dataType === "NUMERIC") {
    return {
      type: "NUMERIC",
      id: scoreId,
      values: [finalValue],
      average: finalValue,
      comment: finalComment,
      hasMetadata: false,
    };
  }

  // CATEGORICAL
  return {
    type: "CATEGORICAL",
    id: scoreId,
    values: [finalStringValue],
    valueCounts: [{ value: finalStringValue, count: 1 }],
    comment: finalComment,
    hasMetadata: false,
  };
}

/**
 * Merges cached score writes into score aggregates for optimistic UI.
 *
 * Operation precedence (applied in this order):
 * 1. Deletes remove scores completely (even if also updated)
 * 2. Updates modify existing scores (including cached creates)
 * 3. Creates add new scores to empty slots
 *
 * @param scoreAggregate - Raw score aggregates from ClickHouse
 * @param cache - Write cache with creates/updates/deletes
 * @param traceId - Trace ID for matching cached creates
 * @param observationId - Observation ID for matching cached creates
 * @param scoreColumns - Score column definitions for iteration
 * @returns Merged aggregate with cache applied (non-mutating)
 */
export function mergeScoreAggregateWithCache(
  scoreAggregate: ScoreAggregate,
  cache: ScoreWriteCacheContextValue,
  traceId: string,
  observationId: string | undefined,
  scoreColumns: ScoreColumn[],
): ScoreAggregate {
  const result = { ...scoreAggregate };

  // Process each score column
  for (const column of scoreColumns) {
    const key = column.key;
    const aggregate = result[key];

    // CASE 1: Single value aggregate exists
    if (aggregate?.id) {
      // Priority 1: Check if deleted
      if (isDeleted(aggregate.id, cache)) {
        delete result[key];
        continue;
      }

      // Priority 2: Check if updated
      const update = cache.updates.get(aggregate.id);
      if (update) {
        result[key] = applyUpdate(aggregate, update);
        continue;
      }

      // No changes, keep as-is
      continue;
    }

    // CASE 2: No single value aggregate
    // Check for cached create matching this trace/obs/column
    const columnDataType = resolveAggregateType(column.dataType);
    const create = findMatchingCreate(
      cache.creates,
      traceId,
      observationId,
      column.name,
      columnDataType,
    );

    if (create) {
      const [scoreId, cachedScore] = create;

      // Check if this create also has an update
      const update = cache.updates.get(scoreId);

      // Build aggregate from create (+ optional update)
      result[key] = buildAggregateFromCreate(cachedScore, scoreId, update);
    }
  }

  return result;
}
