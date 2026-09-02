// Metric option for the per-slot dropdown
export type MetricOption = {
  id: string;
  label: string;
  group: "Base Metrics" | "Scores";
  /**
   * The level the score was recorded at, absent on base metrics. Presentation
   * only: the metric still resolves to one level to plot, but the dropdown
   * tags the entry with the level instead of splitting the list by it — the
   * tracing tables' score facets read the same way.
   */
  level?: ScoreLevel;
  /**
   * How the score's values read, absent on base metrics. Boolean scores share
   * the numeric bucket (they are stored as 0/1) but summarise as a share
   * rather than a magnitude, so they rank below a true numeric as a default.
   */
  valueKind?: "numeric" | "boolean" | "categorical";
};

/**
 * How many values each score name carries across the runs in view, per level.
 * Keyed by normalized score name, as `collectScoreNameCoverage` returns it.
 */
export type ScoreCoverageByLevel = Partial<
  Record<ScoreLevel, ReadonlyMap<string, number>>
>;

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
