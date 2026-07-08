import { type AggregatedScoreData } from "@langfuse/shared";
import type Decimal from "decimal.js";

export type NumericDiff = {
  type: "NUMERIC";
  absoluteDifference: number;
  direction: "+" | "-";
};

export type CategoricalDiff = {
  type: "CATEGORICAL";
  isDifferent: true;
};

export type BaselineDiff = NumericDiff | CategoricalDiff | null;

/**
 * Calculate numeric diff between current and baseline values
 * Handles number, Decimal, null, undefined
 * Returns null if diff cannot be calculated or values are equal
 */
export function calculateNumericDiff(
  current: number | Decimal | null | undefined,
  baseline: number | Decimal | null | undefined,
): BaselineDiff | null {
  if (current == null || baseline == null) return null;

  // Convert to numbers
  const currentNum = typeof current === "number" ? current : current.toNumber();
  const baselineNum =
    typeof baseline === "number" ? baseline : baseline.toNumber();

  //  Same value → no diff
  const diff = currentNum - baselineNum;
  if (diff === 0) return null;

  return {
    absoluteDifference: Math.abs(diff),
    direction: diff > 0 ? "+" : "-",
    type: "NUMERIC",
  };
}

/**
 * Calculate diff between current and baseline score aggregate
 * Returns null if diff cannot be calculated
 */
export function calculateScoreDiff(
  current: AggregatedScoreData | null,
  baseline: AggregatedScoreData | null,
): BaselineDiff {
  // Missing data → no diff
  if (!current || !baseline) return null;

  // Aggregate scores (no id) → skip
  if (!current.id || !baseline.id) return null;

  // Type mismatch → no diff
  if (current.type !== baseline.type) return null;

  if (current.type === "NUMERIC" && baseline.type === "NUMERIC") {
    return calculateNumericDiff(current.average, baseline.average);
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
