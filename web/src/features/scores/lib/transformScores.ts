import { type APIScoreV2, type ScoreConfigDomain } from "@langfuse/shared";
import { type ScoreAggregate } from "@langfuse/shared";
import { type AnnotationScore } from "@/src/features/scores/types";
import { type CachedScore } from "@/src/features/scores/contexts/ScoreCacheContext";
import {
  decomposeAggregateScoreKey,
  normalizeScoreName,
} from "@/src/features/scores/lib/aggregateScores";

/**
 * Transform flat merged scores to annotation scores (Trace/Observation/Session Detail)
 */
export function transformToAnnotationScores(
  mergedScores: APIScoreV2[],
  configs: ScoreConfigDomain[],
): AnnotationScore[];

/**
 * Transform aggregates to annotation scores (Compare View)
 */
export function transformToAnnotationScores(
  mergedAggregates: ScoreAggregate,
  configs: ScoreConfigDomain[],
  traceId: string,
  observationId?: string,
): AnnotationScore[];

/**
 * Transform merged scores (flat or aggregate) to annotation scores
 *
 * Handles two input formats:
 * - APIScoreV2[] (flat scores from trace detail)
 * - ScoreAggregate (aggregated scores from compare view)
 *
 * Filters to ANNOTATION source only and excludes multi-value aggregates.
 */
export function transformToAnnotationScores(
  input: APIScoreV2[] | ScoreAggregate,
  configs: ScoreConfigDomain[],
  traceId?: string,
  observationId?: string,
): AnnotationScore[] {
  // Check if input is an array (flat scores)
  if (Array.isArray(input)) {
    return transformFlatScores(input, configs);
  }

  // Otherwise, it's aggregates
  if (!traceId) {
    throw new Error(
      "traceId is required when transforming score aggregates to annotation scores",
    );
  }
  return transformAggregates(input, configs, traceId, observationId);
}

/**
 * Transform flat merged scores to annotation scores
 * Used for trace/observation/session detail annotation drawer
 */
function transformFlatScores(
  mergedScores: APIScoreV2[],
  configs: ScoreConfigDomain[],
): AnnotationScore[] {
  return mergedScores
    .filter((score) => score.source === "ANNOTATION")
    .map((score) => {
      const config = configs.find((c) => c.id === score.configId);
      if (!config || !score.configId) return null;

      return {
        id: score.id,
        name: score.name,
        dataType: score.dataType,
        source: score.source,
        configId: score.configId,
        value: score.value,
        stringValue: score.stringValue,
        comment: score.comment,
        traceId: score.traceId ?? null,
        observationId: score.observationId ?? null,
        sessionId: score.sessionId ?? null,
      };
    })
    .filter((score) => score !== null);
}

/**
 * Transform aggregates to annotation scores
 * Used for compare view annotation panel (compare drawer)
 */
function transformAggregates(
  mergedAggregates: ScoreAggregate,
  configs: ScoreConfigDomain[],
  traceId: string,
  observationId?: string,
): AnnotationScore[] {
  const scores: AnnotationScore[] = [];

  Object.entries(mergedAggregates).forEach(([key, aggregate]) => {
    const { name, source, dataType } = decomposeAggregateScoreKey(key);

    // Only ANNOTATION source can be edited, and must have single ID
    // Multi-value aggregates (no id) are child observation scores - skip them
    if (source !== "ANNOTATION" || !aggregate.id) return;

    const config = configs.find(
      (c) => normalizeScoreName(c.name) === name && c.dataType === dataType,
    );
    if (!config) return;

    const score: AnnotationScore = {
      id: aggregate.id,
      name,
      dataType,
      source,
      configId: config.id,
      traceId,
      observationId: observationId ?? null,
      sessionId: null,
      comment: aggregate.comment ?? null,
      value: null,
      stringValue: null,
    };

    if (aggregate.type === "NUMERIC") {
      score.value = aggregate.average ?? null;
    } else {
      score.stringValue = aggregate.values[0] ?? null;
    }

    scores.push(score);
  });

  return scores;
}

/**
 * Flatten score aggregates to APIScoreV2[] format
 * Used to normalize aggregate input for AnnotateDrawerContent
 */
export function flattenAggregates(
  aggregates: ScoreAggregate,
  configs: ScoreConfigDomain[],
  traceId: string,
  observationId?: string,
): APIScoreV2[] {
  const scores: APIScoreV2[] = [];

  Object.entries(aggregates).forEach(([key, aggregate]) => {
    const { name, source, dataType } = decomposeAggregateScoreKey(key);

    // Only include if has single ID
    if (!aggregate.id) return;

    const config = configs.find(
      (c) => normalizeScoreName(c.name) === name && c.dataType === dataType,
    );
    if (!config) return;

    scores.push({
      id: aggregate.id,
      name,
      dataType,
      source,
      configId: config.id,
      value: aggregate.type === "NUMERIC" ? (aggregate.average ?? null) : null,
      stringValue:
        aggregate.type === "CATEGORICAL" ? (aggregate.values[0] ?? null) : null,
      comment: aggregate.comment ?? null,
      traceId,
      observationId: observationId ?? null,
      sessionId: null,
      projectId: "", // Not needed for display
      timestamp: new Date(),
      authorUserId: null,
      queueId: null,
    } as APIScoreV2);
  });

  return scores;
}
