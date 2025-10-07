import { composeAggregateScoreKey } from "@/src/features/scores/lib/aggregateScores";
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
      if (!scoreColumns.some((col) => col.key === columnKey)) {
        setScoreColumns((prev) => [
          ...prev,
          {
            key: columnKey,
            name: score.name,
            dataType: score.dataType,
            source: "ANNOTATION",
          },
        ]);
      }
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

function resolveNumericValue(
  cachedCreate: CachedScore,
  cachedUpdate?: CachedScore,
): { value: number; comment: string | null } {
  return {
    value: (cachedUpdate ? cachedUpdate.value : cachedCreate.value) as number,
    comment: cachedUpdate ? cachedUpdate.comment : cachedCreate.comment,
  };
}

function resolveCategoricalValue(
  cachedCreate: CachedScore,
  cachedUpdate?: CachedScore,
): { value: string; comment: string | null } {
  return {
    value: (cachedUpdate
      ? cachedUpdate.stringValue
      : cachedCreate.stringValue) as string,
    comment: cachedUpdate ? cachedUpdate.comment : cachedCreate.comment,
  };
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

  for (const scoreColumn of scoreColumns) {
    const key = scoreColumn.key;
    const columnAggregateType =
      scoreColumn.dataType === "BOOLEAN" ? "CATEGORICAL" : scoreColumn.dataType;
    const aggregate = merged[key];

    if (!aggregate) {
      // check for creates
      // Search through creates for matching traceId+observationId+name
      for (const [createdScoreId, cachedCreate] of cache.creates.entries()) {
        if (
          cachedCreate.traceId === traceId &&
          cachedCreate.observationId === observationId &&
          cachedCreate.name === scoreColumn.name &&
          cachedCreate.dataType === columnAggregateType
        ) {
          // check for any updates
          const cachedUpdate = cache.updates.get(createdScoreId);

          if (cachedCreate.dataType === "NUMERIC") {
            const { value, comment } = resolveNumericValue(
              cachedCreate,
              cachedUpdate,
            );
            merged[key] = {
              type: "NUMERIC",
              id: createdScoreId,
              values: value ? [value] : [],
              comment,
              average: value as number,
            };
          } else if (cachedCreate.dataType === "CATEGORICAL") {
            const { value, comment } = resolveCategoricalValue(
              cachedCreate,
              cachedUpdate,
            );
            merged[key] = {
              type: "CATEGORICAL",
              id: createdScoreId,
              values: value ? [value] : [],
              valueCounts: [{ value: value, count: 1 }],
              comment,
            };
          }
          break;
        }
      }
    } else if (aggregate.id) {
      // Check if deleted - remove from aggregate entirely
      if (cache.deletes.has(aggregate.id)) {
        delete merged[key];
        continue;
      }

      // Check for cached update (keyed by scoreId)
      const cachedUpdate = cache.updates.get(aggregate.id);
      if (cachedUpdate) {
        if (aggregate.type === "NUMERIC" && cachedUpdate.value) {
          merged[key] = {
            ...aggregate,
            values: [cachedUpdate.value as number],
            comment: cachedUpdate.comment,
            average: cachedUpdate.value as number,
          };
        } else if (aggregate.type === "CATEGORICAL") {
          merged[key] = {
            ...aggregate,
            values: [cachedUpdate.stringValue as string],
            comment: cachedUpdate.comment,
          };
        }
        continue;
      }
    }
  }

  return merged;
}
