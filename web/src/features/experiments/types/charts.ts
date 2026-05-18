import type { WidgetConfig } from "@/src/features/widgets/hooks/useWidgetQuery";

// Extended widget config for experiment charts with query-building fields
// Omit conflicting properties from WidgetConfig that have readonly/mutable mismatches
export interface ExperimentWidgetConfig extends WidgetConfig {
  orderBy: readonly { field: string; direction: "asc" | "desc" }[];
  timeDimension: null;
  entityDimension: { field: string };
  schedulerId?: string;
}

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

export type ScoreFilterOptions = {
  obs_scores_avg?: string[];
  obs_score_categories?: Record<string, string[]>;
  trace_scores_avg?: string[];
  trace_score_categories?: Record<string, string[]>;
  experiment_scores_avg?: string[];
  experiment_score_categories?: Record<string, string[]>;
};

export type ScoreLevel = "obs" | "trace" | "experiment";
export type ScoreChartDataType = "numeric" | "categorical";

export type ScoreMetricSpec = Record<
  `${ScoreLevel}:${ScoreChartDataType}`,
  {
    level: ScoreLevel;
    dataType: ScoreChartDataType;
    filterKey: keyof ScoreFilterOptions;
    group: Exclude<MetricOption["group"], "Base Metrics">;
  }
>;
