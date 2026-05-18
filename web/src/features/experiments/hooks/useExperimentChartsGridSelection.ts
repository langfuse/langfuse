import { useMemo, useCallback } from "react";
import useSessionStorage from "@/src/components/useSessionStorage";
import {
  EXPERIMENT_COST_WIDGET_CONFIG,
  EXPERIMENT_LATENCY_WIDGET_CONFIG,
  createNumericExperimentScoreWidgetConfig,
  createCategoricalExperimentScoreWidgetConfig,
  createNumericExperimentRunScoreWidgetConfig,
  createCategoricalExperimentRunScoreWidgetConfig,
  type ExperimentWidgetConfig,
} from "../constants/experimentWidgetQueries";

// Constants
export const MAX_CHARTS = 4;

// Metric option for the per-slot dropdown
export type MetricOption = {
  id: string;
  label: string;
  group:
    | "Base Metrics"
    | "Observation Scores"
    | "Trace Scores"
    | "Experiment Scores";
};

// Dynamic chart selection (variable length, max 4)
export type ChartSelection = string[];

// Base chart IDs
export const BASE_CHART_IDS = {
  COST: "base:cost",
  LATENCY: "base:latency",
} as const;

// Build chart ID from type and score name
export const buildScoreChartId = (
  level: "obs" | "trace" | "run",
  dataType: "numeric" | "categorical",
  scoreName: string,
): string => `${level}-score-${dataType}:${scoreName}`;

// Parse chart ID to extract components
const parseScoreChartId = (
  chartId: string,
): {
  level: "obs" | "trace" | "run";
  dataType: "numeric" | "categorical";
  scoreName: string;
} | null => {
  const match = chartId.match(
    /^(obs|trace|run)-score-(numeric|categorical):(.+)$/,
  );
  if (!match) return null;
  return {
    level: match[1] as "obs" | "trace" | "run",
    dataType: match[2] as "numeric" | "categorical",
    scoreName: match[3],
  };
};

export type ScoreFilterOptions = {
  obs_scores_avg?: string[];
  obs_score_categories?: Record<string, string[]>;
  trace_scores_avg?: string[];
  trace_score_categories?: Record<string, string[]>;
  run_scores_avg?: string[];
  run_score_categories?: Record<string, string[]>;
};

/**
 * Build widget config from a chart ID.
 * Works for both base charts and score charts (parsed from ID).
 */
export function buildWidgetConfigFromId(
  chartId: string,
): ExperimentWidgetConfig | null {
  // Base charts
  if (chartId === BASE_CHART_IDS.COST) {
    return EXPERIMENT_COST_WIDGET_CONFIG;
  }
  if (chartId === BASE_CHART_IDS.LATENCY) {
    return EXPERIMENT_LATENCY_WIDGET_CONFIG;
  }

  // Score charts - parse ID to get score name and level
  const parsed = parseScoreChartId(chartId);
  if (!parsed) return null;

  const { level, dataType, scoreName } = parsed;

  // Experiment-run-level scores - use the dedicated widget configs
  if (level === "run") {
    if (dataType === "numeric") {
      return createNumericExperimentRunScoreWidgetConfig({
        scoreName,
        schedulerId: chartId,
        name: `Run: ${scoreName}`,
      });
    } else {
      return createCategoricalExperimentRunScoreWidgetConfig({
        scoreName,
        schedulerId: chartId,
        name: `Run: ${scoreName}`,
      });
    }
  }

  // Observation/Trace-level scores - need observationId filter
  const observationIdFilter: {
    column: string;
    operator: "is null" | "is not null";
    value: "";
    type: "null";
  } =
    level === "trace"
      ? {
          column: "observationId",
          operator: "is null",
          value: "",
          type: "null",
        }
      : {
          column: "observationId",
          operator: "is not null",
          value: "",
          type: "null",
        };

  if (dataType === "numeric") {
    const baseConfig = createNumericExperimentScoreWidgetConfig({
      scoreName,
      schedulerId: chartId,
      name: `${level === "trace" ? "Trace: " : ""}${scoreName}`,
    });
    return {
      ...baseConfig,
      filters: [...(baseConfig.filters ?? []), observationIdFilter],
    };
  } else {
    const baseConfig = createCategoricalExperimentScoreWidgetConfig({
      scoreName,
      schedulerId: chartId,
      name: `${level === "trace" ? "Trace: " : ""}${scoreName}`,
    });
    return {
      ...baseConfig,
      filters: [...(baseConfig.filters ?? []), observationIdFilter],
    };
  }
}

/**
 * Get smart default charts based on available scores.
 * Starts with Cost and Latency.
 */
function getDefaultCharts(): ChartSelection {
  return [BASE_CHART_IDS.COST, BASE_CHART_IDS.LATENCY];
}

/**
 * Build all available metric options from score filter options for the dropdown.
 */
function buildMetricOptions(
  scoreFilterOptions: ScoreFilterOptions,
): MetricOption[] {
  const options: MetricOption[] = [
    // Base metrics (always available)
    {
      id: BASE_CHART_IDS.COST,
      label: "Cost ($)",
      group: "Base Metrics",
    },
    {
      id: BASE_CHART_IDS.LATENCY,
      label: "Latency (ms)",
      group: "Base Metrics",
    },
  ];

  // Observation-level numeric scores
  for (const scoreName of scoreFilterOptions.obs_scores_avg ?? []) {
    options.push({
      id: buildScoreChartId("obs", "numeric", scoreName),
      label: scoreName,
      group: "Observation Scores",
    });
  }

  // Observation-level categorical scores
  for (const scoreName of Object.keys(
    scoreFilterOptions.obs_score_categories ?? {},
  )) {
    options.push({
      id: buildScoreChartId("obs", "categorical", scoreName),
      label: scoreName,
      group: "Observation Scores",
    });
  }

  // Trace-level numeric scores
  for (const scoreName of scoreFilterOptions.trace_scores_avg ?? []) {
    options.push({
      id: buildScoreChartId("trace", "numeric", scoreName),
      label: scoreName,
      group: "Trace Scores",
    });
  }

  // Trace-level categorical scores
  for (const scoreName of Object.keys(
    scoreFilterOptions.trace_score_categories ?? {},
  )) {
    options.push({
      id: buildScoreChartId("trace", "categorical", scoreName),
      label: scoreName,
      group: "Trace Scores",
    });
  }

  // Experiment-run-level numeric scores
  for (const scoreName of scoreFilterOptions.run_scores_avg ?? []) {
    options.push({
      id: buildScoreChartId("run", "numeric", scoreName),
      label: scoreName,
      group: "Experiment Scores",
    });
  }

  // Experiment-run-level categorical scores
  for (const scoreName of Object.keys(
    scoreFilterOptions.run_score_categories ?? {},
  )) {
    options.push({
      id: buildScoreChartId("run", "categorical", scoreName),
      label: scoreName,
      group: "Experiment Scores",
    });
  }

  return options;
}

/**
 * Validate that stored data is a valid ChartSelection (array of strings, max 4).
 */
function isValidChartSelection(data: unknown): data is ChartSelection {
  if (!Array.isArray(data)) return false;
  if (data.length > MAX_CHARTS) return false;
  return data.every((item) => typeof item === "string" && item.length > 0);
}

/**
 * Hook to manage dynamic experiment chart selection with session storage persistence.
 * Supports add/remove operations with a max of 4 charts.
 */
export function useExperimentChartsGridSelection({
  projectId,
  scoreFilterOptions,
}: {
  projectId: string;
  scoreFilterOptions: ScoreFilterOptions;
}) {
  // Default charts
  const defaultCharts = useMemo(() => getDefaultCharts(), []);

  // Session storage for chart selections
  const [rawCharts, setCharts] = useSessionStorage<ChartSelection>(
    `experiment-charts-grid-${projectId}`,
    defaultCharts,
  );

  // Validate stored data format - fall back to defaults if invalid
  const charts: ChartSelection = useMemo(() => {
    if (isValidChartSelection(rawCharts) && rawCharts.length > 0) {
      return rawCharts;
    }
    // Invalid or empty data - return defaults
    return defaultCharts;
  }, [rawCharts, defaultCharts]);

  // Build all available metric options for the dropdowns
  const availableMetricOptions = useMemo(
    () => buildMetricOptions(scoreFilterOptions),
    [scoreFilterOptions],
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
  };
}
