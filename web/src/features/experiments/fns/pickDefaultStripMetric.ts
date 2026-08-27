import { BASE_CHART_IDS } from "@/src/features/experiments/constants/charts";
import type { MetricOption } from "@/src/features/experiments/types/charts";

/** Score chart ids are `${level}-score-${dataType}:${scoreName}`. */
const NUMERIC_SCORE_ID = /^(obs|experiment)-score-numeric:/;

/**
 * Which metric the strip opens on. The rule: the first score by name, numeric
 * before categorical, with ties (the same score name at two levels) keeping the
 * option order — observation-level first. Cost is the fallback only when the
 * experiments in view carry no scores at all, so the default visualisation
 * answers "did quality move?" instead of "what did it cost?". (LFE-15711)
 */
export function pickDefaultStripMetric(options: MetricOption[]): string {
  const scores = options.filter((option) => option.group !== "Base Metrics");

  const [first] = [...scores].sort((a, b) => {
    const byDataType =
      Number(NUMERIC_SCORE_ID.test(b.id)) - Number(NUMERIC_SCORE_ID.test(a.id));
    return byDataType !== 0 ? byDataType : a.label.localeCompare(b.label);
  });

  return first?.id ?? BASE_CHART_IDS.COST;
}
