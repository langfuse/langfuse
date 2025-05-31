/**
 * Shared table names used across batch operations (exports, actions, etc.)
 * This enum provides a centralized definition of database table names
 * to avoid coupling between different batch operation types.
 */
export enum BatchTableNames {
  Scores = "scores",
  Sessions = "sessions",
  Traces = "traces",
  Observations = "observations",
  DatasetRunItems = "dataset_run_items",
}
