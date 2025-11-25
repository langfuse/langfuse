/**
 * Shared table names used across batch operations (exports, actions, etc.)
 * This enum provides a centralized definition of database table names
 * to avoid coupling between different batch operation types.
 */
export enum BatchTableNames {
  Scores = "scores", // eslint-disable-line no-unused-vars
  Sessions = "sessions", // eslint-disable-line no-unused-vars
  Traces = "traces", // eslint-disable-line no-unused-vars
  Observations = "observations", // eslint-disable-line no-unused-vars
  DatasetRunItems = "dataset_run_items", // eslint-disable-line no-unused-vars
  DatasetItems = "dataset_items", // eslint-disable-line no-unused-vars
  AuditLogs = "audit_logs", // eslint-disable-line no-unused-vars
}
