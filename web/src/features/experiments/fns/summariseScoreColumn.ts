import { type AggregatedScoreData } from "@langfuse/shared";

/** The score's declared type, which decides what an aggregate of it can mean. */
export type ScoreColumnDataType = "NUMERIC" | "BOOLEAN" | "CATEGORICAL";

/** One item's pair of aggregates for a single score column. */
export type ScoreColumnPair = {
  baseline: AggregatedScoreData | null;
  comparison: AggregatedScoreData | null;
};

export type ScoreColumnAggregate =
  /** Mean of the items' values. NUMERIC only. */
  | { kind: "average"; value: number; count: number }
  /** Share of `true` across the items. BOOLEAN only. */
  | { kind: "trueRate"; value: number; count: number }
  /** Categorical scores have no mean, so the modal value carries the column. */
  | {
      kind: "distribution";
      modalValue: string;
      distribution: Array<{ value: string; count: number }>;
      count: number;
    };

export type ScoreColumnMovement = {
  improved: number;
  regressed: number;
  unchanged: number;
  /** A different value with no order to it — categorical only. */
  changed: number;
  /** One side has no score for this item, or the two cannot be compared. */
  notComparable: number;
};

export type ScoreColumnSummary = {
  baseline: ScoreColumnAggregate | null;
  comparison: ScoreColumnAggregate | null;
  /** `comparison − baseline` on the ordered reading of the score, else null. */
  delta: number | null;
  /** Null when no comparison is selected. */
  movement: ScoreColumnMovement | null;
};

const BOOLEAN_TRUE_VALUES = new Set(["true", "True"]);

const countValues = (aggregate: AggregatedScoreData) =>
  aggregate.type === "NUMERIC"
    ? aggregate.values.length
    : aggregate.valueCounts.reduce((total, entry) => total + entry.count, 0);

/**
 * The score read as a number, so two items can be ordered. A boolean's ordered
 * reading is its true-rate (false < true); a categorical has none.
 */
const orderedValue = (
  aggregate: AggregatedScoreData | null,
  dataType: ScoreColumnDataType,
): number | null => {
  if (!aggregate) return null;
  if (dataType === "CATEGORICAL") return null;
  if (aggregate.type === "NUMERIC") return aggregate.average;
  if (dataType !== "BOOLEAN") return null;

  const total = countValues(aggregate);
  if (total === 0) return null;
  const trueCount = aggregate.valueCounts
    .filter((entry) => BOOLEAN_TRUE_VALUES.has(entry.value))
    .reduce((sum, entry) => sum + entry.count, 0);
  return trueCount / total;
};

/** The single categorical value of an item, or null if it carries several. */
const singleCategoricalValue = (
  aggregate: AggregatedScoreData | null,
): string | null => {
  if (!aggregate || aggregate.type !== "CATEGORICAL") return null;
  return aggregate.values.length === 1 ? aggregate.values[0] : null;
};

const aggregateAcrossItems = (
  aggregates: AggregatedScoreData[],
  dataType: ScoreColumnDataType,
): ScoreColumnAggregate | null => {
  if (aggregates.length === 0) return null;

  if (dataType === "CATEGORICAL") {
    const counts = new Map<string, number>();
    for (const aggregate of aggregates) {
      if (aggregate.type !== "CATEGORICAL") continue;
      for (const { value, count } of aggregate.valueCounts) {
        counts.set(value, (counts.get(value) ?? 0) + count);
      }
    }
    if (counts.size === 0) return null;
    // Most frequent first, ties by value so the header is stable across fetches.
    const distribution = [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    return {
      kind: "distribution",
      modalValue: distribution[0].value,
      distribution,
      count: aggregates.length,
    };
  }

  const values = aggregates
    .map((aggregate) => orderedValue(aggregate, dataType))
    .filter((value): value is number => value !== null);
  if (values.length === 0) return null;

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return dataType === "BOOLEAN"
    ? { kind: "trueRate", value: mean, count: values.length }
    : { kind: "average", value: mean, count: values.length };
};

const emptyMovement = (): ScoreColumnMovement => ({
  improved: 0,
  regressed: 0,
  unchanged: 0,
  changed: 0,
  notComparable: 0,
});

/**
 * What a score column's header says about the items in view: this experiment's
 * aggregate, the comparison's, the signed delta, and how many items moved which
 * way. This is the analysis the deleted Analytics tab was going to carry, put
 * where the eye already is. (LFE-15711)
 *
 * An item with no score on either side is **not comparable**, never a
 * regression: it is counted separately and stays visible in the header's hover.
 * Categorical scores have no order, so they only ever report changed/unchanged.
 */
export const summariseScoreColumn = ({
  pairs,
  dataType,
  hasComparison,
}: {
  pairs: ScoreColumnPair[];
  dataType: ScoreColumnDataType;
  hasComparison: boolean;
}): ScoreColumnSummary => {
  const baseline = aggregateAcrossItems(
    pairs
      .map((pair) => pair.baseline)
      .filter((aggregate): aggregate is AggregatedScoreData => !!aggregate),
    dataType,
  );

  if (!hasComparison) {
    return { baseline, comparison: null, delta: null, movement: null };
  }

  const comparison = aggregateAcrossItems(
    pairs
      .map((pair) => pair.comparison)
      .filter((aggregate): aggregate is AggregatedScoreData => !!aggregate),
    dataType,
  );

  const movement = emptyMovement();
  for (const pair of pairs) {
    if (!pair.baseline || !pair.comparison) {
      movement.notComparable += 1;
      continue;
    }

    if (dataType === "CATEGORICAL") {
      const baselineValue = singleCategoricalValue(pair.baseline);
      const comparisonValue = singleCategoricalValue(pair.comparison);
      if (baselineValue === null || comparisonValue === null) {
        movement.notComparable += 1;
      } else if (baselineValue === comparisonValue) {
        movement.unchanged += 1;
      } else {
        movement.changed += 1;
      }
      continue;
    }

    const baselineValue = orderedValue(pair.baseline, dataType);
    const comparisonValue = orderedValue(pair.comparison, dataType);
    if (baselineValue === null || comparisonValue === null) {
      movement.notComparable += 1;
    } else if (comparisonValue > baselineValue) {
      movement.improved += 1;
    } else if (comparisonValue < baselineValue) {
      movement.regressed += 1;
    } else {
      movement.unchanged += 1;
    }
  }

  const orderedBaseline =
    baseline && baseline.kind !== "distribution" ? baseline.value : null;
  const orderedComparison =
    comparison && comparison.kind !== "distribution" ? comparison.value : null;

  return {
    baseline,
    comparison,
    delta:
      orderedBaseline !== null && orderedComparison !== null
        ? orderedComparison - orderedBaseline
        : null,
    movement,
  };
};
