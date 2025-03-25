export const ClickhouseTableNames = {
  traces: "traces",
  observations: "observations",
  scores: "scores",

  // Virtual tables for dashboards
  // TODO: Check if we can do this more elegantly
  scores_numeric: "scores_numeric",
  scores_categorical: "scores_categorical",
} as const;

export type ClickhouseTableName = keyof typeof ClickhouseTableNames;
