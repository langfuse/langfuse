import type { AnnotationScore, ScoreTarget } from "@/src/features/scores/types";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { type ScoreDomain } from "@langfuse/shared";

/**
 * Filter scores to match exact target based on mode
 *
 * @param scores - Scores to filter (must have traceId, observationId, sessionId properties)
 * @param target - Target to match against
 * @param mode - Filter mode: "target-scores-only" for exact match, "target-and-child-scores" for all
 * @returns Filtered scores matching the target
 */
export function filterScoresByTarget<
  T extends WithStringifiedMetadata<ScoreDomain> | AnnotationScore,
>(
  scores: T[],
  target: ScoreTarget,
  mode: "target-and-child-scores" | "target-scores-only",
): T[] {
  if (mode === "target-and-child-scores") {
    // Include all scores for this trace/session
    return scores;
  }

  // target-scores-only: filter to exact target match
  return scores.filter((score) => {
    if (target.type === "session") {
      return score.sessionId === target.sessionId;
    }
    // Trace target: match both traceId AND observationId
    return (
      score.traceId === target.traceId &&
      (score.observationId ?? null) === (target.observationId ?? null)
    );
  });
}
