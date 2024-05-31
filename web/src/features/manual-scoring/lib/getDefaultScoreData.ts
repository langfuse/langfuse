import { type Score, ScoreSource } from "@langfuse/shared";

export const getDefaultScoreData = ({
  scores,
  traceId,
  observationId,
}: {
  scores: Score[];
  traceId: string;
  observationId?: string;
}) => {
  return scores
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
};
