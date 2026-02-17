export const ClickhouseTableNames = {
  traces: "traces",
  observations: "observations",
  scores: "scores",
  events: "events",
  dataset_run_items_rmt: "dataset_run_items_rmt",

  // Virtual tables for dashboards
  // TODO: Check if we can do this more elegantly
  scores_numeric: "scores_numeric",
  scores_categorical: "scores_categorical",
  events_traces: "events_traces",
  events_observations: "events_observations",
} as const;

export type ClickhouseTableName = keyof typeof ClickhouseTableNames;
