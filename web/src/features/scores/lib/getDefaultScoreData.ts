import {
  type ScoreTarget,
  type ScoreTargetTrace,
  type ScoreTargetSession,
} from "@langfuse/shared";
import { ScoreSource } from "@langfuse/shared";
import { type ScoreConfigDomain } from "@langfuse/shared";
import { isTraceScore } from "@/src/features/scores/lib/helpers";
import { type AnnotationScoreDataSchema } from "@/src/features/scores/schema";
import { type z } from "zod/v4";
import { type AnnotationScore } from "@/src/features/scores/types";

const isAnnotationScore = (score: AnnotationScore) =>
  score.source === ScoreSource.ANNOTATION;

const filterTraceAnnotationScores =
  ({ traceId, observationId }: ScoreTargetTrace) =>
  (s: AnnotationScore) =>
    isAnnotationScore(s) &&
    s.traceId === traceId &&
    (observationId !== undefined
      ? s.observationId === observationId
      : s.observationId === null);

const filterSessionAnnotationScores =
  ({ sessionId }: ScoreTargetSession) =>
  (s: AnnotationScore) =>
    isAnnotationScore(s) && s.sessionId === sessionId;

export const getDefaultAnnotationScoreData = ({
  scores,
  emptySelectedConfigIds,
  configs,
  scoreTarget,
}: {
  scores: AnnotationScore[];
  emptySelectedConfigIds: string[];
  configs: ScoreConfigDomain[];
  scoreTarget: ScoreTarget;
}): z.infer<typeof AnnotationScoreDataSchema>[] => {
  const isValidScore = isTraceScore(scoreTarget)
    ? filterTraceAnnotationScores(scoreTarget)
    : filterSessionAnnotationScores(scoreTarget);

  const populatedScores = scores
    .filter(isValidScore)
    .map(({ id, name, value, dataType, stringValue, configId, comment }) => ({
      scoreId: id ?? undefined,
      name,
      value,
      dataType,
      stringValue: stringValue ?? undefined,
      configId: configId ?? undefined,
      comment: comment ?? undefined,
    }));

  const populatedScoresConfigIds = new Set(
    populatedScores.map((s) => s.configId),
  );

  const emptyScores = configs
    .filter(
      (c) =>
        !populatedScoresConfigIds.has(c.id) &&
        emptySelectedConfigIds.includes(c.id),
    )
    .map(({ name, dataType, id }) => ({
      scoreId: undefined,
      name,
      value: undefined,
      dataType,
      stringValue: undefined,
      configId: id,
      comment: undefined,
    }));

  return [...populatedScores, ...emptyScores];
};
