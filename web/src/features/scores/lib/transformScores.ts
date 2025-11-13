import { type ScoreDomain, type ScoreConfigDomain } from "@langfuse/shared";
import { type ScoreAggregate } from "@langfuse/shared";
import { type AnnotationScore } from "@/src/features/scores/types";
import {
  decomposeAggregateScoreKey,
  normalizeScoreName,
} from "@/src/features/scores/lib/aggregateScores";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";

/**
 * Transform flat merged scores to annotation scores (Trace/Observation/Session Detail)
 */
export function transformToAnnotationScores(
  mergedScores: WithStringifiedMetadata<ScoreDomain>[],
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
 * - ScoreDomain[] (flat scores from trace detail)
 * - ScoreAggregate (aggregated scores from compare view)
 *
 * Filters to ANNOTATION source only and excludes multi-value aggregates.
 */
export function transformToAnnotationScores(
  input: WithStringifiedMetadata<ScoreDomain>[] | ScoreAggregate,
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
  mergedScores: WithStringifiedMetadata<ScoreDomain>[],
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
        timestamp: score.timestamp,
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
      timestamp: aggregate.timestamp ?? null,
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
