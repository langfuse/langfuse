export const ClickhouseTableNames = {
  traces: "traces",
  observations: "observations",
  scores: "scores",
  dataset_run_items_rmt: "dataset_run_items_rmt",

  // Virtual table for UI column mappings validation (eventsTableUiColumnDefinitions).
  events_proto: "events_proto",

  // Actual events tables used for dashboard/metrics query joins.
  events_core: "events_core",
  events_full: "events_full",

  // Virtual tables for dashboards
  // TODO: Check if we can do this more elegantly
  scores_numeric: "scores_numeric",
  scores_categorical: "scores_categorical",
  events_traces: "events_traces",
  events_observations: "events_observations",
} as const;

export type ClickhouseTableName = keyof typeof ClickhouseTableNames;

// Identifiers that map to the physical events_core/events_full tables at query
// time. events_proto is the column-mapping placeholder; events_core and
// events_full are the physical tables.
export const EVENTS_TABLE_NAMES = [
  ClickhouseTableNames.events_proto,
  ClickhouseTableNames.events_core,
  ClickhouseTableNames.events_full,
] as const satisfies readonly ClickhouseTableName[];

export type EventsTableName = (typeof EVENTS_TABLE_NAMES)[number];
