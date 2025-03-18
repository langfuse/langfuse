export const ClickhouseTableNames = {
  traces: "traces",
  observations: "observations",
  scores: "scores",
} as const;

export type ClickhouseTableName = keyof typeof ClickhouseTableNames;
