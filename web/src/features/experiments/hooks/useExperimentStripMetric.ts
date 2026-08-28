import { useMemo } from "react";
import useSessionStorage from "@/src/components/useSessionStorage";
import { buildMetricOptions } from "@/src/features/experiments/utils/charts";
import { pickDefaultStripMetric } from "@/src/features/experiments/fns/pickDefaultStripMetric";
import { api } from "@/src/utils/api";
import { type ScoreFilterOptions } from "@/src/features/experiments/types/charts";

const processCategoricalScoreOptions = (
  categories: Array<{ label: string; values: string[] }>,
): Record<string, string[]> =>
  Object.fromEntries(categories.map(({ label, values }) => [label, values]));

/**
 * The metric the experiments strip plots, persisted per project in session
 * storage. Nothing is persisted until the user picks one, so the score-first
 * default (`pickDefaultStripMetric`) keeps applying as the score options
 * arrive — and a stored metric that the experiments in view no longer carry
 * falls back to it instead of rendering an empty chart.
 *
 * `isLoading` covers "we do not know the options yet", not just "a request is
 * in flight". `pickDefaultStripMetric`'s Cost fallback asserts something —
 * that the experiments in view carry no scores — and only the score-options
 * query can assert it. Until it has, the strip must show its loading state:
 * reporting ready would put "Cost ($)" in the header of a project full of
 * scores. (LFE-15711)
 */
export function useExperimentStripMetric({
  projectId,
  experimentIds,
}: {
  projectId: string;
  experimentIds: string[];
}) {
  // `projectId` arrives with `router.query` after hydration; without it in the
  // guard the query can fire with `undefined` and zod rejects it. With no
  // experiments in view there is nothing to ask about.
  const canLoadScoreOptions = Boolean(projectId) && experimentIds.length > 0;

  const scoreOptions = api.experiments.scoreOptions.useQuery(
    { projectId, experimentIds },
    { enabled: canLoadScoreOptions },
  );

  const [selectedMetricId, setSelectedMetricId] = useSessionStorage<
    string | null
  >(`experiment-strip-metric-${projectId}`, null);

  const transformedScoreOptions = useMemo((): ScoreFilterOptions => {
    if (!scoreOptions.data) {
      return {};
    }
    return {
      obs_scores_avg: scoreOptions.data.obs_scores_avg,
      obs_score_categories: processCategoricalScoreOptions(
        scoreOptions.data.obs_score_categories,
      ),
      trace_scores_avg: scoreOptions.data.trace_scores_avg,
      trace_score_categories: processCategoricalScoreOptions(
        scoreOptions.data.trace_score_categories,
      ),
      experiment_scores_avg: scoreOptions.data.experiment_scores_avg,
      experiment_score_categories: processCategoricalScoreOptions(
        scoreOptions.data.experiment_score_categories,
      ),
    };
  }, [scoreOptions.data]);

  const availableMetricOptions = useMemo(
    () => buildMetricOptions(transformedScoreOptions),
    [transformedScoreOptions],
  );

  const metricId = useMemo(() => {
    if (
      selectedMetricId &&
      availableMetricOptions.some((option) => option.id === selectedMetricId)
    ) {
      return selectedMetricId;
    }
    return pickDefaultStripMetric(availableMetricOptions);
  }, [selectedMetricId, availableMetricOptions]);

  return {
    metricId,
    setMetricId: setSelectedMetricId,
    availableMetricOptions,
    // A disabled query is "pending" forever, so settle on the query's own
    // outcome rather than on `isLoading`, which a not-yet-started fetch
    // reports as false.
    isLoading:
      canLoadScoreOptions && !scoreOptions.isSuccess && !scoreOptions.isError,
  };
}
