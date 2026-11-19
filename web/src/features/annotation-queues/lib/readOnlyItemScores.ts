import { type ScoreConfigDomain, type ScoreDomain } from "@langfuse/shared";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { filterScoresByTarget } from "@/src/features/scores/lib/filterScoresByTarget";
import { transformToAnnotationScores } from "@/src/features/scores/lib/transformScores";
import { type ScoreTarget } from "@/src/features/scores/types";

/**
 * Scores attached to the queue item that the annotation form does not edit.
 * Edited ids come from the same transform the form uses, so the two lists
 * stay complementary when that filter changes.
 */
export function selectReadOnlyItemScores<
  T extends WithStringifiedMetadata<ScoreDomain>,
>(scores: T[], target: ScoreTarget, queueConfigs: ScoreConfigDomain[]): T[] {
  const editedIds = new Set(
    transformToAnnotationScores(scores, queueConfigs).map((score) => score.id),
  );
  return filterScoresByTarget(scores, target, "target-scores-only").filter(
    (score) => !editedIds.has(score.id),
  );
}
