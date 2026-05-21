import { useMemo, useCallback } from "react";
import useSessionStorage from "@/src/components/useSessionStorage";
import {
  buildMetricOptions,
  getDefaultCharts,
  isValidChartSelection,
} from "@/src/features/experiments/utils/charts";
import {
  BASE_CHART_IDS,
  MAX_CHARTS,
} from "@/src/features/experiments/constants/charts";
import { api } from "@/src/utils/api";
import { type ScoreFilterOptions } from "@/src/features/experiments/types/charts";

const processCategoricalScoreOptions = (
  categories: Array<{ label: string; values: string[] }>,
): Record<string, string[]> =>
  Object.fromEntries(categories.map(({ label, values }) => [label, values]));

/**
 * Hook to manage dynamic experiment chart selection with session storage persistence.
 * Supports add/remove operations with a max of 4 charts.
 */
export function useExperimentChartsGridSelection({
  projectId,
  experimentIds,
}: {
  projectId: string;
  experimentIds: string[];
}) {
  // Default charts
  const defaultCharts = useMemo(() => getDefaultCharts(), []);

  const scoreOptions = api.experiments.scoreOptions.useQuery({
    projectId,
    experimentIds,
  });

  // Session storage for chart selections
  const [rawCharts, setCharts] = useSessionStorage<string[]>(
    `experiment-charts-grid-${projectId}`,
    defaultCharts,
  );

  // Validate stored data format - fall back to defaults if invalid
  const charts: string[] = useMemo(() => {
    if (isValidChartSelection(rawCharts) && rawCharts.length > 0) {
      return rawCharts;
    }
    // Invalid or empty data - return defaults
    return defaultCharts;
  }, [rawCharts, defaultCharts]);

  // Transform API response to ScoreFilterOptions format
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

  // Build all available metric options for the dropdowns
  const availableMetricOptions = useMemo(
    () => buildMetricOptions(transformedScoreOptions),
    [transformedScoreOptions],
  );

  // Check if we can add more charts
  const canAddChart = charts.length < MAX_CHARTS;

  // Check if we can delete charts (must have more than 1)
  const canDeleteChart = charts.length > 1;

  // Update a specific chart's metric
  const updateChart = useCallback(
    (index: number, metricId: string) => {
      if (index < 0 || index >= charts.length) return;
      const next = [...charts];
      next[index] = metricId;
      setCharts(next);
    },
    [setCharts, charts],
  );

  // Add a new chart with the first available metric not already selected
  const addChart = useCallback(() => {
    if (!canAddChart) return;

    // Find a metric not already in use
    const usedMetrics = new Set(charts);
    const availableMetric = availableMetricOptions.find(
      (opt) => !usedMetrics.has(opt.id),
    );

    // Default to first available option or Cost
    const newMetricId = availableMetric?.id ?? BASE_CHART_IDS.COST;
    setCharts([...charts, newMetricId]);
  }, [canAddChart, charts, availableMetricOptions, setCharts]);

  // Remove a chart at a specific index
  const removeChart = useCallback(
    (index: number) => {
      if (!canDeleteChart) return;
      if (index < 0 || index >= charts.length) return;

      const next = charts.filter((_, i) => i !== index);
      setCharts(next);
    },
    [canDeleteChart, charts, setCharts],
  );

  // Reset to defaults
  const resetToDefaults = useCallback(() => {
    setCharts(defaultCharts);
  }, [setCharts, defaultCharts]);

  return {
    // Current chart selections (metric IDs)
    charts,
    // Update a chart's metric
    updateChart,
    // Add a new chart
    addChart,
    // Remove a chart
    removeChart,
    // Can add more charts?
    canAddChart,
    // Can delete charts? (more than 1)
    canDeleteChart,
    // Reset to defaults
    resetToDefaults,
    // All available metric options (for dropdown)
    availableMetricOptions,
    // Loading state
    isLoading: scoreOptions.isLoading,
  };
}
