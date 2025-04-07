import { type ScoreTarget } from "@/src/features/scores/types";
import { ScoreSource } from "@langfuse/shared";
import { type APIScoreV2, type ValidatedScoreConfig } from "@langfuse/shared";

const filterTraceScores =
  (traceId: string, observationId?: string) => (s: APIScoreV2) =>
    s.source === ScoreSource.ANNOTATION &&
    s.traceId === traceId &&
    (observationId !== undefined
      ? s.observationId === observationId
      : s.observationId === null);

const filterSessionScores = (sessionId: string) => (s: APIScoreV2) =>
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
  const isValidScore =
    scoreTarget.type === "trace"
      ? filterTraceScores(scoreTarget.traceId, scoreTarget.observationId)
      : filterSessionScores(scoreTarget.sessionId);

  const populatedScores = scores
    .filter(isValidScore)
    .map(({ id, name, value, dataType, stringValue, configId, comment }) => ({
      scoreId: id,
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
