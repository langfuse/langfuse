import { ScoreSource } from "@langfuse/shared";
import { type APIScore } from "@/src/features/public-api/types/scores";
import { type ValidatedScoreConfig } from "@/src/features/public-api/types/score-configs";

export const getDefaultScoreData = ({
  scores,
  emptySelectedConfigIds,
  configs,
  traceId,
  observationId,
}: {
  scores: APIScore[];
  emptySelectedConfigIds: string[];
  configs: ValidatedScoreConfig[];
  traceId: string;
  observationId?: string;
}) => {
  const populatedScores = scores
    .filter(
      (s) =>
        s.source === ScoreSource.ANNOTATION &&
        s.traceId === traceId &&
        (observationId !== undefined
          ? s.observationId === observationId
          : s.observationId === null),
    )
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
