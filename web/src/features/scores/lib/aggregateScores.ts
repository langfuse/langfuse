import { getScoreDataTypeIcon } from "@/src/features/scores/lib/scoreColumns";
import {
  type ScoreAggregate,
  type ScoreSimplified,
  type ScoreSourceType,
  type ScoreDomain,
  type AggregatableScoreDataType,
} from "@langfuse/shared";

/**
 * Normalizes score names for comparison by converting - and . to _
 * "-" and "." reserved for splitting in namespace
 */
export const normalizeScoreName = (name: string): string => {
  return name.replaceAll(/[-\.]/g, "_");
};

export const composeAggregateScoreKey = ({
  name,
  source,
  dataType,
}: {
  name: string;
  source: ScoreSourceType;
  dataType: AggregatableScoreDataType;
  keyPrefix?: string;
}): string => {
  const formattedName = normalizeScoreName(name);
  return `${formattedName}-${source}-${dataType}`;
};

export const decomposeAggregateScoreKey = (
  key: string,
): {
  name: string;
  source: ScoreSourceType;
  dataType: AggregatableScoreDataType;
} => {
  const [name, source, dataType] = key.split("-");
  return {
    name,
    source: source as ScoreSourceType,
    dataType: dataType as AggregatableScoreDataType,
  };
};

export const getScoreLabelFromKey = (key: string): string => {
  const { name, source, dataType } = decomposeAggregateScoreKey(key);
  return `${getScoreDataTypeIcon(dataType)} ${name} (${source.toLowerCase()})`;
};

export type ScoreToAggregate =
  | (Omit<ScoreDomain, "dataType"> & {
      dataType: AggregatableScoreDataType;
      hasMetadata?: boolean;
    })
  | (ScoreSimplified & {
      hasMetadata?: boolean;
    });

/**
 * Maps score data types to aggregate types for processing.
 * Boolean scores are treated as categorical since they share the same
 * aggregation logic (value counting vs numeric averaging).
 */
export const resolveAggregateType = (
  dataType: AggregatableScoreDataType,
): "NUMERIC" | "CATEGORICAL" => {
  return dataType === "BOOLEAN" ? "CATEGORICAL" : dataType;
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
    const aggregateType = resolveAggregateType(scores[0].dataType);
    if (aggregateType === "NUMERIC") {
      const values = scores.map((score) => score.value ?? 0);
      if (!Boolean(values.length)) return acc;
      const average = values.reduce((a, b) => a + b, 0) / values.length;
      acc[key] = {
        type: aggregateType,
        values,
        average,
        comment: values.length === 1 ? scores[0].comment : undefined,
        id: values.length === 1 ? scores[0].id : undefined,
        hasMetadata: values.length === 1 ? scores[0].hasMetadata : undefined,
        timestamp: values.length === 1 ? scores[0].timestamp : undefined,
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
        type: aggregateType,
        values,
        valueCounts: Object.entries(valueCounts).map(([value, count]) => ({
          value,
          count,
        })),
        comment: values.length === 1 ? scores[0].comment : undefined,
        id: values.length === 1 ? scores[0].id : undefined,
        hasMetadata: values.length === 1 ? scores[0].hasMetadata : undefined,
        timestamp: values.length === 1 ? scores[0].timestamp : undefined,
      };
    }
    return acc;
  }, {} as ScoreAggregate);
};
