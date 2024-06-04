import { type Score, ScoreSource, type ScoreConfig } from "@langfuse/shared";

export const getDefaultScoreData = ({
  scores,
  traceId,
  observationId,
  configs,
}: {
  scores: Score[];
  traceId: string;
  observationId?: string;
  configs: ScoreConfig[];
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

  if (!Boolean(configs.length)) return populatedScores;

  const emptyScores = configs.map((c) => ({
    scoreId: undefined,
    name: c.name,
    value: undefined,
    dataType: c.dataType,
    stringValue: undefined,
    configId: c.id,
    comment: undefined,
  }));

  return [...populatedScores, ...emptyScores];
};
