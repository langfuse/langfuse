import { type APIScore } from "@/src/features/public-api/types/scores";
import { type ValidatedScoreConfig } from "@/src/features/public-api/types/score-configs";

export const getDefaultScoreData = ({
  annotationScores,
  emptySelectedConfigIds,
  configs,
}: {
  annotationScores: APIScore[];
  emptySelectedConfigIds: string[];
  configs: ValidatedScoreConfig[];
}) => {
  const populatedScores = annotationScores.map(
    ({ id, name, value, dataType, stringValue, configId, comment }) => ({
      scoreId: id,
      name,
      value,
      dataType,
      stringValue: stringValue ?? undefined,
      configId: configId ?? undefined,
      comment: comment ?? undefined,
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
    }));

  return [...populatedScores, ...emptyScores];
};
