import { type AggregatedScoreData } from "@langfuse/shared";

export type NumericDiff = {
  type: "NUMERIC";
  absoluteDifference: number;
  direction: "+" | "-";
};

export type CategoricalDiff = {
  type: "CATEGORICAL";
  isDifferent: true;
};

export type ScoreDiff = NumericDiff | CategoricalDiff | null;

/**
 * Calculate diff between current and baseline score aggregate
 * Returns null if diff cannot be calculated
 */
export function calculateScoreDiff(
  current: AggregatedScoreData | null,
  baseline: AggregatedScoreData | null,
): ScoreDiff {
  // Missing data → no diff
  if (!current || !baseline) return null;

  // Aggregate scores (no id) → skip
  if (!current.id || !baseline.id) return null;

  // Type mismatch → no diff
  if (current.type !== baseline.type) return null;

  if (current.type === "NUMERIC" && baseline.type === "NUMERIC") {
    const diff = current.average - baseline.average;

    // Same value → no diff
    if (diff === 0) return null;

    return {
      type: "NUMERIC",
      absoluteDifference: Math.abs(diff),
      direction: diff > 0 ? "+" : "-",
    };
  }

  if (current.type === "CATEGORICAL" && baseline.type === "CATEGORICAL") {
    const currentValue = current.values[0];
    const baselineValue = baseline.values[0];

    // Same value → no diff
    if (currentValue === baselineValue) return null;

    return {
      type: "CATEGORICAL",
      isDifferent: true,
    };
  }

  return null;
}
