import { type AggregatedScoreData } from "@langfuse/shared";
import {
  readOrderedScoreValue,
  type ScoreColumnDataType,
} from "./summariseScoreColumn";

/** Which score family a filtered column belongs to. */
export type ScoreLevel = "observation" | "trace";

export type ScoreComparisonOperator = "lower" | "higher" | "differs";

/**
 * "Keep the items whose score is lower than the comparison experiment's" — the
 * one predicate the item filters could not express, because it is about a pair
 * of experiments rather than a column against a literal. (LFE-15711 C7)
 */
export type ScoreComparisonFilter = {
  level: ScoreLevel;
  /** Aggregate score key, e.g. `groundedness-EVAL-NUMERIC`. */
  scoreKey: string;
  operator: ScoreComparisonOperator;
  /** The experiment the score is read against. */
  comparisonExperimentId: string;
};

const OPERATORS: ScoreComparisonOperator[] = ["lower", "higher", "differs"];

/**
 * `level:scoreKey:operator:experimentId`. Score keys are normalised to hold no
 * colon and experiment ids are uuids, so the separator is unambiguous.
 */
export const encodeScoreComparisonFilter = (
  filter: ScoreComparisonFilter,
): string =>
  [
    filter.level,
    filter.scoreKey,
    filter.operator,
    filter.comparisonExperimentId,
  ].join(":");

export const decodeScoreComparisonFilter = (
  encoded: string | null | undefined,
): ScoreComparisonFilter | null => {
  if (!encoded) return null;
  const [level, scoreKey, operator, comparisonExperimentId] =
    encoded.split(":");
  if (level !== "observation" && level !== "trace") return null;
  if (!scoreKey || !comparisonExperimentId) return null;
  if (!OPERATORS.includes(operator as ScoreComparisonOperator)) return null;
  return {
    level,
    scoreKey,
    operator: operator as ScoreComparisonOperator,
    comparisonExperimentId,
  };
};

export const isSameScoreComparisonTarget = (
  a: ScoreComparisonFilter,
  b: ScoreComparisonFilter,
) => a.level === b.level && a.scoreKey === b.scoreKey;

/**
 * Whether one item passes the filter, read the same way the column header reads
 * it: an item only one of the two experiments scored is not comparable, so it is
 * never a regression and never kept. A categorical score has no order, so only
 * `differs` can match it.
 */
export const matchesScoreComparisonFilter = ({
  operator,
  dataType,
  baseline,
  comparison,
}: {
  operator: ScoreComparisonOperator;
  dataType: ScoreColumnDataType;
  baseline: AggregatedScoreData | null | undefined;
  comparison: AggregatedScoreData | null | undefined;
}): boolean => {
  if (!baseline || !comparison) return false;

  if (dataType === "CATEGORICAL") {
    // No order, so only "differs" means anything on a categorical score.
    if (operator !== "differs") return false;
    if (baseline.type !== "CATEGORICAL" || comparison.type !== "CATEGORICAL")
      return false;
    return (
      [...baseline.values].sort().join("|") !==
      [...comparison.values].sort().join("|")
    );
  }

  const baselineValue = readOrderedScoreValue(baseline, dataType);
  const comparisonValue = readOrderedScoreValue(comparison, dataType);
  if (baselineValue === null || comparisonValue === null) return false;

  if (operator === "differs") return baselineValue !== comparisonValue;
  return operator === "lower"
    ? baselineValue < comparisonValue
    : baselineValue > comparisonValue;
};

const OPERATOR_WORDS: Record<ScoreComparisonOperator, string> = {
  lower: "Worse",
  higher: "Better",
  differs: "Different",
};

/** The chip's plain English: "Worse groundedness than judge-haiku-baseline". */
export const describeScoreComparisonFilter = ({
  operator,
  scoreName,
  comparisonName,
}: {
  operator: ScoreComparisonOperator;
  scoreName: string;
  comparisonName: string;
}): string =>
  `${OPERATOR_WORDS[operator]} ${scoreName} ${
    operator === "differs" ? "vs" : "than"
  } ${comparisonName}`;

/** Which of a row's two score maps a level's scores live in. */
export const scoreFieldForLevel = (level: ScoreLevel) =>
  level === "trace" ? ("traceScores" as const) : ("observationScores" as const);

/**
 * Whether one item survives every active score comparison. A filter whose score
 * type is not known yet (the column definitions still loading) does not hide
 * rows.
 */
export const rowPassesScoreComparisonFilters = ({
  filters,
  experiments,
  baselineExperimentId,
  dataTypeFor,
}: {
  filters: ScoreComparisonFilter[];
  experiments: Array<{
    experimentId: string;
    observationScores: Record<string, AggregatedScoreData>;
    traceScores: Record<string, AggregatedScoreData>;
  }>;
  baselineExperimentId?: string;
  dataTypeFor: (
    filter: ScoreComparisonFilter,
  ) => ScoreColumnDataType | undefined;
}): boolean => {
  if (filters.length === 0) return true;
  if (!baselineExperimentId) return true;

  const scoresOf = (experimentId: string, level: ScoreLevel) =>
    experiments.find(
      (experiment) => experiment.experimentId === experimentId,
    )?.[scoreFieldForLevel(level)];

  return filters.every((filter) => {
    const dataType = dataTypeFor(filter);
    if (!dataType) return true;
    return matchesScoreComparisonFilter({
      operator: filter.operator,
      dataType,
      baseline: scoresOf(baselineExperimentId, filter.level)?.[filter.scoreKey],
      comparison: scoresOf(filter.comparisonExperimentId, filter.level)?.[
        filter.scoreKey
      ],
    });
  });
};

/** What an emptied table says, so it reads as an answer and not as a failure. */
export const describeEmptyScoreComparison = ({
  operator,
  scoreName,
  comparisonName,
}: {
  operator: ScoreComparisonOperator;
  scoreName: string;
  comparisonName: string;
}): string => {
  if (operator === "differs")
    return `No item on this page scored ${scoreName} differently from ${comparisonName}.`;
  if (operator === "lower")
    return `No regressions on this score — no item on this page scored lower on ${scoreName} than ${comparisonName}.`;
  return `No item on this page scored higher on ${scoreName} than ${comparisonName}.`;
};
