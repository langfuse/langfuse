import { useMemo } from "react";
import { type ScoreAggregate } from "@langfuse/shared";
import {
  useScoreCache,
  type CachedScore,
} from "@/src/features/scores/contexts/ScoreCacheContext";
import { composeAggregateScoreKey } from "@/src/features/scores/lib/aggregateScores";
import { mergeAggregatesWithCache } from "@/src/features/scores/lib/mergeScoresWithCache";
import { type ExperimentItemsTableRow } from "../components/table/types";
import { type ScoreColumnDef } from "./useExperimentItemsFilterOptions";

type ExperimentScoreColumns = {
  observationScoreColumns: ScoreColumnDef[];
  traceScoreColumns: ScoreColumnDef[];
};

const columnKey = (column: ScoreColumnDef) =>
  composeAggregateScoreKey({
    ...column,
    source: column.source as "API" | "ANNOTATION" | "EVAL",
  });

/** One score snapshot for the column selector, cells, summaries and filters. */
export function useExperimentItemsScoreCache(
  rows: ExperimentItemsTableRow[] | undefined,
  scoreColumns: ExperimentScoreColumns,
) {
  const { getAllForTarget, isDeleted } = useScoreCache();

  return useMemo(() => {
    const observationColumns = new Map(
      scoreColumns.observationScoreColumns.map((column) => [
        columnKey(column),
        column,
      ]),
    );
    const traceColumns = new Map(
      scoreColumns.traceScoreColumns.map((column) => [
        columnKey(column),
        column,
      ]),
    );
    const merge = (
      aggregates: ScoreAggregate,
      traceId: string,
      observationId: string | undefined,
      columns: Map<string, ScoreColumnDef>,
    ) => {
      const cached = getAllForTarget("target-scores-only", {
        traceId,
        observationId,
      }).filter(
        (
          score,
        ): score is CachedScore & { dataType: ScoreColumnDef["dataType"] } =>
          score.dataType === "NUMERIC" ||
          score.dataType === "BOOLEAN" ||
          score.dataType === "CATEGORICAL",
      );
      for (const { name, source, dataType } of cached) {
        const column = { name, source, dataType };
        const key = columnKey(column);
        if (!columns.has(key)) columns.set(key, column);
      }
      const deletedIds = new Set(
        Object.values(aggregates).flatMap(({ id }) =>
          id && isDeleted(id) ? [id] : [],
        ),
      );
      return mergeAggregatesWithCache(aggregates, cached, deletedIds);
    };
    const mergedRows = rows?.map((row) => ({
      ...row,
      experiments: row.experiments.map((experiment) => ({
        ...experiment,
        observationScores: merge(
          experiment.observationScores,
          experiment.traceId,
          experiment.observationId,
          observationColumns,
        ),
        traceScores: merge(
          experiment.traceScores,
          experiment.traceId,
          undefined,
          traceColumns,
        ),
      })),
    }));
    return {
      rows: mergedRows,
      scoreColumns: {
        observationScoreColumns: Array.from(observationColumns.values()),
        traceScoreColumns: Array.from(traceColumns.values()),
      },
    };
  }, [rows, scoreColumns, getAllForTarget, isDeleted]);
}
