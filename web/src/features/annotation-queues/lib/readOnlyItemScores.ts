import { type ScoreConfigDomain, type ScoreDomain } from "@langfuse/shared";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { filterScoresByTarget } from "@/src/features/scores/lib/filterScoresByTarget";
import {
  ANNOTATION_SCORE_DATA_TYPES_ARRAY,
  type ScoreTarget,
} from "@/src/features/scores/types";

const editableAnnotationDataTypes = new Set<string>(
  ANNOTATION_SCORE_DATA_TYPES_ARRAY,
);

/**
 * Scores the annotation form edits: ANNOTATION values whose config is attached
 * to the queue and whose data type the form can render.
 */
function isEditedByQueueForm(
  score: {
    source: string;
    configId: string | null;
    dataType: string;
  },
  queueConfigIds: ReadonlySet<string>,
): boolean {
  return (
    score.source === "ANNOTATION" &&
    score.configId != null &&
    queueConfigIds.has(score.configId) &&
    editableAnnotationDataTypes.has(score.dataType)
  );
}

/**
 * Scores attached to the queue item that the annotation form does not edit.
 * The form stays limited to the queue's score configs. Everything else on the
 * same trace, observation, or session stays visible.
 */
export function selectReadOnlyItemScores<
  T extends WithStringifiedMetadata<ScoreDomain>,
>(scores: T[], target: ScoreTarget, queueConfigs: ScoreConfigDomain[]): T[] {
  const queueConfigIds = new Set(queueConfigs.map((config) => config.id));
  return filterScoresByTarget(scores, target, "target-scores-only").filter(
    (score) => !isEditedByQueueForm(score, queueConfigIds),
  );
}
