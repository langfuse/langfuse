import { BASE_CHART_IDS } from "@/src/features/experiments/constants/charts";
import type {
  MetricOption,
  ScoreCoverageByLevel,
} from "@/src/features/experiments/types/charts";
import { normalizeScoreName } from "@/src/features/scores/lib/aggregateScores";

/** Score chart ids are `${level}-score-${dataType}:${scoreName}`. */
const NUMERIC_SCORE_ID = /^(obs|trace|experiment)-score-numeric:/;

/** Numeric first: only a numeric average reads as a bar in a 63px band. */
const VALUE_KIND_RANK: Record<
  NonNullable<MetricOption["valueKind"]>,
  number
> = {
  numeric: 0,
  boolean: 1,
  categorical: 1,
};

const valueKindOf = (
  option: MetricOption,
): NonNullable<MetricOption["valueKind"]> =>
  option.valueKind ??
  (NUMERIC_SCORE_ID.test(option.id) ? "numeric" : "categorical");

/**
 * Which metric the strip opens on. Coverage-first, so it lands on the score the
 * runs in view actually measured rather than on whichever name sorts first:
 *
 * 1. numeric before boolean/categorical;
 * 2. then the highest coverage, the score carrying the most recorded values
 *    across the runs in view, counted client-side from the rows already
 *    fetched (`collectScoreNameCoverage`) so no query is added;
 * 3. then the name, a stable tiebreak so the default cannot flicker between
 *    renders. One name at two levels ties into the option order (observation,
 *    trace, then run level);
 * 4. Cost only when the runs in view carry no scores at all, so the default
 *    answers "did quality move?" instead of "what did it cost?".
 *
 * Coverage is unknown until the row metrics land; until then the order falls
 * through to the name. A user's explicit pick always wins — see
 * `useExperimentStripMetric`.
 */
export function pickDefaultStripMetric(
  options: MetricOption[],
  scoreCoverage?: ScoreCoverageByLevel,
): string {
  const scores = options.filter((option) => option.group !== "Base Metrics");

  const coverageOf = (option: MetricOption): number =>
    option.level
      ? (scoreCoverage?.[option.level]?.get(normalizeScoreName(option.label)) ??
        0)
      : 0;

  const [first] = [...scores].sort(
    (a, b) =>
      VALUE_KIND_RANK[valueKindOf(a)] - VALUE_KIND_RANK[valueKindOf(b)] ||
      coverageOf(b) - coverageOf(a) ||
      a.label.localeCompare(b.label),
  );

  return first?.id ?? BASE_CHART_IDS.COST;
}
