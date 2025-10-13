import {
  normalizeScoreName,
  decomposeAggregateScoreKey,
} from "@/src/features/scores/lib/aggregateScores";
import { type AnnotationScore } from "@/src/features/scores/types";
import { type ScoreConfigDomain, type ScoreAggregate } from "@langfuse/shared";

/**
 * Filters aggregates to single-value entries only (ID present).
 * Excludes multi-value aggregations (no ID).
 *
 * @param aggregates - Score aggregates to filter
 * @param configs - Score configs to match disabled entries
 * @returns Filtered aggregates and set of disabled config IDs
 */
export const filterSingleValueAggregates = (
  aggregates: ScoreAggregate,
  configs: ScoreConfigDomain[],
): {
  filtered: ScoreAggregate;
  disabledConfigIds: Set<string>;
} => {
  const disabledConfigIds = new Set<string>();

  const filtered = Object.entries(aggregates)
    .filter(([key, aggregate]) => {
      if (!aggregate.id) {
        // Find matching config and add to disabled set
        const { name, dataType } = decomposeAggregateScoreKey(key);
        const config = configs.find(
          (c) => normalizeScoreName(c.name) === name && c.dataType === dataType,
        );
        if (config) disabledConfigIds.add(config.id);
        return false;
      }
      return true;
    })
    .reduce((acc, [key, aggregate]) => {
      acc[key] = aggregate;
      return acc;
    }, {} as ScoreAggregate);

  return { filtered, disabledConfigIds };
};

/**
 * Converts ScoreAggregate to AnnotationScore[] for annotation panel rendering.
 * Filters for ANNOTATION source only and maps categorical values via configs.
 *
 * @param scoreAggregate - Raw aggregate score data
 * @param configs - Score configs for categorical value mapping
 * @param traceId - Target trace ID
 * @param observationId - Target observation ID (null for trace-level)
 * @returns Filtered annotation scores
 */
export const transformSingleValueAggregateScoreData = (
  scoreAggregate: ScoreAggregate,
  configs: ScoreConfigDomain[],
  traceId: string,
  observationId: string | null,
): AnnotationScore[] => {
  return Object.entries(scoreAggregate)
    .map(([key, score]) => {
      const { name, dataType, source } = decomposeAggregateScoreKey(key);
      if (source !== "ANNOTATION" || !score.id) {
        return null;
      }

      const config = configs.find(
        (c) => normalizeScoreName(c.name) === name && c.dataType === dataType,
      );
      if (!config) {
        return null;
      }

      const baseScoreData = {
        id: score.id,
        name,
        dataType,
        source,
        comment: score.comment ?? undefined,
        configId: config.id,
        traceId,
        observationId,
        sessionId: null,
      };

      if (score.type === "NUMERIC") {
        return {
          ...baseScoreData,
          stringValue: null,
          value: score.average,
        };
      }

      const value =
        config.categories?.find((c) => c.label === score.values[0])?.value ??
        null;

      // Skip scores with invalid categorical mappings (config mutation)
      if (value === null) return null;
      return {
        ...baseScoreData,
        value,
        stringValue: score.values[0],
      };
    })
    .filter((score) => score !== null);
};
