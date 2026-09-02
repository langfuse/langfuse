// Metric option for the per-slot dropdown
export type MetricOption = {
  id: string;
  label: string;
  group: "Base Metrics" | "Observation Scores" | "Experiment Scores";
};

export type ScoreFilterOptions = {
  obs_scores_avg?: string[];
  obs_score_categories?: Record<string, string[]>;
  obs_score_booleans?: string[];
  experiment_scores_avg?: string[];
  experiment_score_categories?: Record<string, string[]>;
  experiment_score_booleans?: string[];
};

type ScoreNameLevels = Record<string, ("observation" | "trace")[]>;

/**
 * What the three score facets offer, plus the level(s) each offered name exists
 * at so the picker can tag them.
 */
export type ExperimentItemScoreFilterOptions = {
  scores_avg?: string[];
  score_categories?: Record<string, string[]>;
  score_booleans?: string[];
  score_name_levels_numeric?: ScoreNameLevels;
  score_name_levels_categorical?: ScoreNameLevels;
  score_name_levels_boolean?: ScoreNameLevels;
};

export type ScoreLevel = "obs" | "experiment";
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
