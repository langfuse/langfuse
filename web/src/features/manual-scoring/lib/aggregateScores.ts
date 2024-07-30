import { type APIScore } from "@/src/features/public-api/types/scores";
import { type ScoreSource, type ScoreDataType } from "@langfuse/shared";

export type QualitativeAggregate = {
  type: "QUALITATIVE";
  values: string[];
  distribution: { value: string; count: number }[];
  comment?: string | null;
};

export type QuantitativeAggregate = {
  type: "QUANTITATIVE";
  values: number[];
  average: number;
  comment?: string | null;
};

export type ScoreAggregate = Record<
  string,
  QualitativeAggregate | QuantitativeAggregate
>;

export type ScoreSimplified = {
  name: string;
  value?: number | null;
  stringValue: string | null;
  source: ScoreSource;
  dataType: ScoreDataType;
  comment?: string | null;
};

export const composeAggregateScoreKey = ({
  name,
  source,
  dataType,
  keyPrefix,
}: {
  name: string;
  source: ScoreSource;
  dataType: ScoreDataType;
  keyPrefix?: string;
}): string =>
  keyPrefix
    ? `${keyPrefix}.${name}.${source}.${dataType}`
    : `${name}.${source}.${dataType}`;

export const aggregateScores = <T extends APIScore | ScoreSimplified>(
  scores: T[],
  keyPrefix?: string,
): ScoreAggregate => {
  const groupedScores: Record<string, T[]> = scores.reduce(
    (acc, score) => {
      const key = composeAggregateScoreKey({
        name: score.name,
        source: score.source,
        dataType: score.dataType,
        keyPrefix,
      });
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(score);
      return acc;
    },
    {} as Record<string, T[]>,
  );

  // step 2: for each group, determine if the score is qualitative or quantitative & compute aggregate for group
  return Object.entries(groupedScores).reduce((acc, [key, scores]) => {
    if (scores[0].dataType === "NUMERIC") {
      const values = scores.map((score) => score.value as number);
      const average = values.reduce((a, b) => a + b, 0) / values.length;
      acc[key] = {
        type: "QUANTITATIVE",
        values,
        average,
        comment: values.length === 1 ? scores[0].comment : undefined,
      };
    } else {
      const values = scores.map((score) => score.stringValue as string);
      const distribution = values.reduce(
        (acc, value) => {
          acc[value] = (acc[value] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );
      acc[key] = {
        type: "QUALITATIVE",
        values,
        distribution: Object.entries(distribution).map(([value, count]) => ({
          value,
          count,
        })),
        comment: values.length === 1 ? scores[0].comment : undefined,
      };
    }
    return acc;
  }, {} as ScoreAggregate);
};
