export const ClickhouseTableNames = {
  traces: "traces",
  observations: "observations",
  scores: "scores",
  dataset_run_items_rmt: "dataset_run_items_rmt",

  // Virtual table for UI column mappings validation.
  // Actual queries use events_core or events_full tables directly.
  events_proto: "events_proto",

  // Virtual tables for dashboards
  // TODO: Check if we can do this more elegantly
  scores_numeric: "scores_numeric",
  scores_categorical: "scores_categorical",
} as const;

export type ClickhouseTableName = keyof typeof ClickhouseTableNames;
