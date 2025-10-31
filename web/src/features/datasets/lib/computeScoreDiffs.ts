import { type ScoreAggregate } from "@langfuse/shared";
import { calculateScoreDiff, type ScoreDiff } from "./calculateScoreDiff";

/**
 * Compute diffs for all scores between current and baseline aggregates
 * Returns a map of scoreColumnKey → diff for efficient O(1) lookup during render
 */
export function computeScoreDiffs(
  currentScores: ScoreAggregate,
  baselineScores: ScoreAggregate | null,
): Record<string, ScoreDiff> {
  if (!baselineScores) return {};

  const diffs: Record<string, ScoreDiff> = {};

  for (const [key, currentAgg] of Object.entries(currentScores)) {
    const baselineAgg = baselineScores[key];
    const diff = calculateScoreDiff(currentAgg, baselineAgg ?? null);

    if (diff !== null) {
      diffs[key] = diff;
    }
  }

  return diffs;
}
