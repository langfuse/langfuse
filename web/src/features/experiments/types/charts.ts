// Metric option for the per-slot dropdown
export type MetricOption = {
  id: string;
  label: string;
  group: "Base Metrics" | "Scores";
  /**
   * The level the score was recorded at, absent on base metrics. Presentation
   * only: the metric still resolves to one level to plot, but the dropdown
   * tags the entry with the level instead of splitting the list by it — the
   * tracing tables' score facets read the same way. (LFE-15711)
   */
  level?: ScoreLevel;
};

export type ScoreFilterOptions = {
  obs_scores_avg?: string[];
  obs_score_categories?: Record<string, string[]>;
  obs_score_booleans?: string[];
  trace_scores_avg?: string[];
  trace_score_categories?: Record<string, string[]>;
  trace_score_booleans?: string[];
  experiment_scores_avg?: string[];
  experiment_score_categories?: Record<string, string[]>;
  experiment_score_booleans?: string[];
};

export type ExperimentItemScoreFilterOptions = {
  obs_scores_avg?: string[];
  obs_score_categories?: Record<string, string[]>;
  obs_score_booleans?: string[];
  trace_scores_avg?: string[];
  trace_score_categories?: Record<string, string[]>;
  trace_score_booleans?: string[];
};

export type ScoreLevel = "obs" | "trace" | "experiment";
export type ScoreChartDataType = "numeric" | "categorical";

export type ScoreMetricSpec = Record<
  `${ScoreLevel}:${ScoreChartDataType}`,
  {
    level: ScoreLevel;
    dataType: ScoreChartDataType;
    filterKey: keyof ScoreFilterOptions;
  }
>;
