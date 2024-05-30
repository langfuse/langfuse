import { type ScoreConfig, type Score, ScoreSource } from "@langfuse/shared";

export const getDefaultScoreData = ({
  scores,
  traceId,
  observationId,
  configs,
}: {
  scores: Score[];
  traceId: string;
  observationId?: string;
  configs?: ScoreConfig[];
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
    .map((s) => ({
      scoreId: s.id,
      name: s.name,
      value: s.value,
      dataType: s.dataType,
      stringValue: s.stringValue ?? undefined,
      configId: s.configId ?? undefined,
      comment: s.comment ?? undefined,
    }));

  if (!configs) return populatedScores;

  const emptyScores = configs
    .filter((config) => !populatedScores.some((s) => s.configId === config.id))
    .map((config) => ({
      name: config.name,
      dataType: config.dataType,
      configId: config.id,
    }));

  return [...populatedScores, ...emptyScores];
};
