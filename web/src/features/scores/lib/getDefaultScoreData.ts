import {
  type ScoreTarget,
  type ScoreTargetTrace,
  type ScoreTargetSession,
} from "@langfuse/shared";
import { ScoreSource } from "@langfuse/shared";
import { type APIScoreV2, type ValidatedScoreConfig } from "@langfuse/shared";
import { isTraceScore } from "@/src/features/scores/lib/helpers";

const filterTraceScores =
  ({ traceId, observationId }: ScoreTargetTrace) =>
  (s: APIScoreV2) =>
    s.source === ScoreSource.ANNOTATION &&
    s.traceId === traceId &&
    (observationId !== undefined
      ? s.observationId === observationId
      : s.observationId === null);

const filterSessionScores =
  ({ sessionId }: ScoreTargetSession) =>
  (s: APIScoreV2) =>
    s.source === ScoreSource.ANNOTATION && s.sessionId === sessionId;

export const getDefaultScoreData = ({
  scores,
  emptySelectedConfigIds,
  configs,
  scoreTarget,
}: {
  scores: APIScoreV2[];
  emptySelectedConfigIds: string[];
  configs: ValidatedScoreConfig[];
  scoreTarget: ScoreTarget;
}) => {
  const isValidScore = isTraceScore(scoreTarget)
    ? filterTraceScores(scoreTarget)
    : filterSessionScores(scoreTarget);

  const populatedScores = scores
    .filter(isValidScore)
    .map(
      ({
        id,
        name,
        value,
        dataType,
        stringValue,
        configId,
        comment,
        metadata,
      }) => ({
        scoreId: id,
        name,
        value,
        dataType,
        stringValue: stringValue ?? undefined,
        configId: configId ?? undefined,
        comment: comment ?? undefined,
        metadata: metadata ?? undefined,
      }),
    );

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
      metadata: undefined,
    }));

  return [...populatedScores, ...emptyScores];
};
