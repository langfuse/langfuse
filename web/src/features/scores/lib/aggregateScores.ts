import {
  type ScoreAggregate,
  type ScoreSimplified,
  type APIScoreV2,
  type ScoreSourceType,
  type ScoreDataType,
} from "@langfuse/shared";

export const composeAggregateScoreKey = ({
  name,
  source,
  dataType,
}: {
  name: string;
  source: ScoreSourceType;
  dataType: ScoreDataType;
  keyPrefix?: string;
}): string => {
  const formattedName = name.replaceAll(/[-\.]/g, "_"); // "-" and "." reserved for splitting in namespace
  return `${formattedName}-${source}-${dataType}`;
};

type ScoreToAggregate = (APIScoreV2 | ScoreSimplified) & {
  hasMetadata?: boolean;
};

export const aggregateScores = <T extends ScoreToAggregate>(
  scores: T[],
): ScoreAggregate => {
  const groupedScores: Record<string, T[]> = scores.reduce(
    (acc, score) => {
      const key = composeAggregateScoreKey({
        name: score.name,
        source: score.source,
        dataType: score.dataType,
      });
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(score);
      return acc;
    },
    {} as Record<string, T[]>,
  );

  // step 2: for each group, determine if the score is categorical or numeric & compute aggregate for group
  /* IMPORTANT
   * Some ScoreAggregates have a single value, and then include extra fields: comment, id, hasMetadata.
   * When the aggregate contains multiple values, these extra fields are undefined.
   */
  return Object.entries(groupedScores).reduce((acc, [key, scores]) => {
    if (scores[0].dataType === "NUMERIC") {
      const values = scores.map((score) => score.value ?? 0);
      if (!Boolean(values.length)) return acc;
      const average = values.reduce((a, b) => a + b, 0) / values.length;
      acc[key] = {
        type: "NUMERIC",
        values,
        average,
        comment: values.length === 1 ? scores[0].comment : undefined,
        id: values.length === 1 ? scores[0].id : undefined,
        hasMetadata: values.length === 1 ? scores[0].hasMetadata : undefined,
      };
    } else {
      const values = scores.map((score) => score.stringValue ?? "n/a");
      if (!Boolean(values.length)) return acc;
      const valueCounts = values.reduce(
        (acc, value) => {
          acc[value] = (acc[value] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );
      acc[key] = {
        type: "CATEGORICAL",
        values,
        valueCounts: Object.entries(valueCounts).map(([value, count]) => ({
          value,
          count,
        })),
        comment: values.length === 1 ? scores[0].comment : undefined,
        id: values.length === 1 ? scores[0].id : undefined,
        hasMetadata: values.length === 1 ? scores[0].hasMetadata : undefined,
      };
    }
    return acc;
  }, {} as ScoreAggregate);
};
